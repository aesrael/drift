import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, PlayerState, QueueSource } from '../types';
import { scrobble, star, unstar, getStarred, getStreamUrl, purgeTrack as purgeTrackApi, purgeAlbum as purgeAlbumApi, purgePlaylist as purgePlaylistApi, updatePlaylist as updatePlaylistApi, purgeGenre as purgeGenreApi, search3 } from '../services/subsonic';
import { downloadTrack, removeDownload } from '../services/downloadService';
import { initCarManager } from '../car/CarManager';
import { trackPlayerManager } from '../services/trackPlayerManager';
import { filterPlayableQueue, isExternalTrackId, resolveExternalTrack } from './playerQueueUtils';
import { getNextQueueIndex, getPreviousQueueIndex, resolveQueueIndex } from './playerNavigationUtils';


interface PlayerContextType extends PlayerState {
  play: (track: Track, queue?: Track[], shouldPlay?: boolean, queueSource?: QueueSource) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  next: () => void;
  previous: () => void;
  seek: (position: number) => Promise<void>;
  setQueue: (queue: Track[], queueSource?: QueueSource) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  load: (track: Track, queue?: Track[], queueSource?: QueueSource) => void;
  toggleShuffle: () => void;
  setUpcomingQueueFromCurrent: (nextTracks: Track[], autoQueueEnabled?: boolean) => void;
  setAutoQueueEnabled: (enabled: boolean) => void;
  toggleHeart: (track: Track) => Promise<void>;
  isHearted: (trackId: string) => boolean;
  purgeTrack: (track: Track) => Promise<void>;
  purgeAlbum: (albumId: string, tracks: Track[]) => Promise<void>;
  purgePlaylist: (playlistId: string, tracks: Track[]) => Promise<void>;
  purgeGenre: (genreName: string, tracks: Track[]) => Promise<void>;
  addToPlaylist: (trackId: string, playlistId: string) => Promise<void>;
  isLoading: boolean;
}

interface PlayerActionsType {
  play: (track: Track, queue?: Track[], shouldPlay?: boolean, queueSource?: QueueSource) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  next: () => void;
  previous: () => void;
  seek: (position: number) => Promise<void>;
  setQueue: (queue: Track[], queueSource?: QueueSource) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  load: (track: Track, queue?: Track[], queueSource?: QueueSource) => void;
  toggleShuffle: () => void;
  setUpcomingQueueFromCurrent: (nextTracks: Track[], autoQueueEnabled?: boolean) => void;
  setAutoQueueEnabled: (enabled: boolean) => void;
  toggleHeart: (track: Track) => Promise<void>;
  isHearted: (trackId: string) => boolean;
  purgeTrack: (track: Track) => Promise<void>;
  purgeAlbum: (albumId: string, tracks: Track[]) => Promise<void>;
  purgePlaylist: (playlistId: string, tracks: Track[]) => Promise<void>;
  purgeGenre: (genreName: string, tracks: Track[]) => Promise<void>;
  addToPlaylist: (trackId: string, playlistId: string) => Promise<void>;
}

const PlayerStateContext = createContext<PlayerState | null>(null);
const PlayerActionsContext = createContext<PlayerActionsType | null>(null);

function shuffleTracks(tracks: Track[]): Track[] {
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
  }
  return shuffled;
}

function buildQueue(track: Track, queue: Track[], isShuffle: boolean): Track[] {
  const baseQueue = queue.length > 0 ? queue : [track];
  if (!isShuffle) {
    return baseQueue;
  }

  const remaining = baseQueue.filter((item) => item.id !== track.id);
  return [track, ...shuffleTracks(remaining)];
}

function pushRecentTrackId(recentTrackIds: string[], trackId: string): string[] {
  const deduped = recentTrackIds.filter((id) => id !== trackId);
  return [trackId, ...deduped].slice(0, 20);
}

// Pre-warm the next `count` tracks in the queue by issuing a 0-byte range
// request. This primes the server/CDN and can trigger backend download queueing
// before the player advances. Fire-and-forget — never throws.
async function warmNextTracks(queue: Track[], currentTrackId: string, count = 3) {
  const currentIndex = queue.findIndex((t) => t.id === currentTrackId);
  if (currentIndex < 0) return;
  const toWarm = queue
    .slice(currentIndex + 1, currentIndex + 1 + count)
    .filter((track) => !!track?.id && !isExternalTrackId(track.id) && !track.id.startsWith('local:'));
  for (const track of toWarm) {
    try {
      const url = await getStreamUrl(track.id);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: controller.signal,
      }).catch(() => {}).finally(() => clearTimeout(timeout));
    } catch {
      // best-effort
    }
  }
}


const LAST_SESSION_KEY = 'lastSession';

interface PersistedSession {
  track: Track;
  queue: Track[];
  queueSource: QueueSource | null;
  wasPlaying: boolean;
  position: number;
}

let persistTimeout: ReturnType<typeof setTimeout> | null = null;
async function persistSession(
  track: Track,
  queue: Track[],
  queueSource: QueueSource | null,
  wasPlaying: boolean,
  position: number
) {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(async () => {
    try {
      // Cap queue at 50 tracks to keep storage small
      const session: PersistedSession = {
        track,
        queue: queue.slice(0, 50),
        queueSource,
        wasPlaying,
        position: Math.max(0, Number(position) || 0),
      };
      await AsyncStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Non-critical — silently ignore
    }
  }, 5000); // Only write to disk every 5 seconds
}

async function loadPersistedSession(): Promise<PersistedSession | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) { 
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    queue: [],
    originalQueue: [],
    queueSource: null,
    recentlyPlayedTrackIds: [],
    starredTrackIds: [],
    isPlaying: false,
    isShuffle: false,
    autoQueueEnabled: false,
    isLoading: false,
  });

  const stateRef = useRef(state);
  const restoredSessionRef = useRef<PersistedSession | null>(null);
  const playRequestIdRef = useRef<number>(0);
  const playTransitionInFlightRef = useRef(false);
  const nextRef = useRef<() => void>(() => {});
  const previousRef = useRef<() => void>(() => {});
  const stallWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const scrobbledTrackIdRef = useRef<string | null>(null);
  const queueIndexRef = useRef<number>(-1);
  const pausedByUserRef = useRef(false);
  const lastAutoNextRef = useRef<{ trackId: string | null; at: number }>({ trackId: null, at: 0 });
  const autoNextCooldownUntilRef = useRef<number>(0);
  const lastProgressRef = useRef<{ trackId: string | null; position: number; duration: number; at: number }>({
    trackId: null,
    position: 0,
    duration: 0,
    at: 0,
  });
  const activeNativeTrackIdRef = useRef<string | null>(null);
  const nativeTrackSyncInFlightRef = useRef(false);
  // Fallback advance bookkeeping: when the native advance event carries no
  // usable track id, we advance the logical queue ourselves (see below).
  const lastAdvanceIndexRef = useRef<number | null>(null);
  const lastExplicitPlayMsRef = useRef(0);

  const clearWatchdog = useCallback(() => {
    if (stallWatchdogRef.current) {
      clearTimeout(stallWatchdogRef.current);
      stallWatchdogRef.current = null;
    }
  }, []);

  const triggerAutoNextOnce = useCallback((reason: string) => {
    const trackId = stateRef.current.currentTrack?.id || null;
    const now = Date.now();
    if (
      trackId &&
      lastAutoNextRef.current.trackId === trackId &&
      now - lastAutoNextRef.current.at < 2000
    ) {
      return;
    }
    lastAutoNextRef.current = { trackId, at: now };
    autoNextCooldownUntilRef.current = now + 4000;
    console.log('[PlayerContext] auto-next trigger:', reason, trackId);
    nextRef.current();
  }, []);

  const maybeAutoAdvanceAfterStop = useCallback(async () => {
    const snapshot = stateRef.current;
    if (Date.now() < autoNextCooldownUntilRef.current) {
      console.log('[PlayerContext] maybeAutoAdvanceAfterStop skip: cooldown active');
      return;
    }
    const currentTrack = snapshot.currentTrack;
    if (!currentTrack) {
      console.log('[PlayerContext] maybeAutoAdvanceAfterStop skip: no current track');
      return;
    }
    if (pausedByUserRef.current) {
      console.log('[PlayerContext] maybeAutoAdvanceAfterStop skip: pausedByUserRef true');
      return;
    }

    const nextIndex = getNextQueueIndex(snapshot.queue, currentTrack, queueIndexRef.current);
    if (nextIndex === null) {
      console.log('[PlayerContext] maybeAutoAdvanceAfterStop skip: no next index', {
        queueLen: snapshot.queue.length,
        currentTrackId: currentTrack.id,
        queueIndexRef: queueIndexRef.current,
      });
      return;
    }

    const live = await trackPlayerManager.getProgress().catch(() => null);
    if (!live) {
      console.log('[PlayerContext] maybeAutoAdvanceAfterStop skip: no live progress');
      return;
    }

    const metadataDuration = (currentTrack.duration || 0) * 1000;
    const liveDuration = Math.max(0, Number(live.duration) || 0);
    const cached =
      lastProgressRef.current.trackId === currentTrack.id &&
      Date.now() - lastProgressRef.current.at < 15000
        ? lastProgressRef.current
        : null;
    const cachedDuration = cached?.duration || 0;
    const duration = Math.max(metadataDuration, liveDuration, cachedDuration);
    const position = Math.max(0, Number(live.position) || 0, cached?.position || 0);
    const nearEnd = duration > 0 && position >= Math.max(0, duration - 2500);
    const unknownDurationConsumed =
      duration <= 0 && position >= 3000;

    console.log('[PlayerContext] maybeAutoAdvanceAfterStop eval', {
      currentTrackId: currentTrack.id,
      nextIndex,
      queueLen: snapshot.queue.length,
      queueIndexRef: queueIndexRef.current,
      livePosition: live.position,
      liveDuration: live.duration,
      liveIsPlaying: live.isPlaying,
      liveIsLoading: live.isLoading,
      metadataDuration,
      cachedDuration,
      effectivePosition: position,
      effectiveDuration: duration,
      nearEnd,
      unknownDurationConsumed,
    });

    if (!live.isPlaying && !live.isLoading && (nearEnd || unknownDurationConsumed)) {
      triggerAutoNextOnce('playback-stopped-near-end');
    }
  }, [triggerAutoNextOnce]);

  const reconcileWithNative = useCallback(async (reason: string, hint?: { index?: number; id?: string }) => {
    // If a sync is already in flight, we can skip lightweight status updates,
    // but we MUST NOT skip updates that carry a specific track hint (like auto-next).
    if (nativeTrackSyncInFlightRef.current && !hint) return;
    nativeTrackSyncInFlightRef.current = true;
    try {
      const native = await trackPlayerManager.getStatusData();
      const snapshot = stateRef.current;

      // Deterministic ID resolution: 
      // 1. Prefer injected ID hint from event (most reliable)
      // 2. Use injected Index hint to look up our JS-side map
      // 3. Fall back to polling the native player index
      let nativeId: string | undefined = hint?.id;
      const effectiveIndex = hint?.index ?? native.index;

      if (!nativeId && effectiveIndex !== undefined && effectiveIndex >= 0) {
        nativeId = trackPlayerManager.getNativeIdForIndex(effectiveIndex);
      }

      const reactId = snapshot.currentTrack?.id || null;
      // During explicit play/next transitions, playback-state callbacks can briefly
      // report stale native indices. Only trust ID changes from authoritative
      // active-track hints while transition is in flight.
      const authoritativeTrackHint =
        !!hint?.id || reason.startsWith('active-track-changed') || reason.includes('initial') || reason.includes('app-foreground');
      const allowTrackIdReconcile = !playTransitionInFlightRef.current || authoritativeTrackHint;
      const idChanged = allowTrackIdReconcile && !!nativeId && reactId !== nativeId;
      const statusChanged = snapshot.isPlaying !== native.isPlaying || snapshot.isLoading !== native.isLoading;

      if (idChanged || statusChanged || reason.includes('app-foreground') || reason.includes('initial')) {
        console.log(`[PlayerContext] reconcile(${reason})`, {
          hintIndex: hint?.index,
          hintId: hint?.id,
          nativeIndex: native.index,
          nativeId,
          isPlaying: native.isPlaying,
          isLoading: native.isLoading,
          reactId,
          idChanged,
          statusChanged
        });
      }

      // Update basic playback status
      // Native id arrived but matches nothing in our queues: the native and
      // logical queues diverged. Advance logically instead of nulling the
      // current track (null would freeze the mini player on the old track).
      if (
        idChanged &&
        nativeId &&
        !snapshot.queue.some((t) => t.id === nativeId) &&
        !snapshot.originalQueue.some((t) => t.id === nativeId) &&
        !playTransitionInFlightRef.current &&
        Date.now() - lastExplicitPlayMsRef.current > 2000
      ) {
        console.warn(`[PlayerContext] reconcile(${reason}) id not in queue, logical next():`, nativeId);
        nextRef.current();
        return;
      }
      setState((prev) => {
        // Double-check sync inside the updater closure
        const currentId = prev.currentTrack?.id || null;
        const needsTrackUpdate = allowTrackIdReconcile && !!nativeId && currentId !== nativeId;
        const needsStatusUpdate = prev.isPlaying !== native.isPlaying || prev.isLoading !== native.isLoading;

        if (!needsTrackUpdate && !needsStatusUpdate) {
          return prev;
        }

        let nextTrack = prev.currentTrack;
        if (needsTrackUpdate) {
          nextTrack =
            prev.queue.find((t) => t.id === nativeId) ||
            prev.originalQueue.find((t) => t.id === nativeId) ||
            null;
          
          if (nextTrack) {
            activeNativeTrackIdRef.current = nextTrack.id;
            queueIndexRef.current = resolveQueueIndex(prev.queue, nextTrack, queueIndexRef.current);
            console.log(`[PlayerContext] reconcile(${reason}) updated state currentTrack=`, nativeId);
          } else {
            console.warn(`[PlayerContext] reconcile(${reason}) track not found in queue:`, nativeId);
          }
        }

        return {
          ...prev,
          currentTrack: nextTrack,
          isPlaying: native.isPlaying,
          isLoading: native.isLoading,
        };
      });

      // Verification & Lookahead: if we just updated the track
      if (idChanged && nativeId) {
        if (!nativeId.startsWith('news-')) {
          scrobbledTrackIdRef.current = null;
          scrobble(nativeId, false).catch(() => {});
        }

        // Rolling lookahead: maintain a 5-track buffer in the native queue.
        // We use stateRef.current NOW because the setState above should have been processed 
        // by the time this code runs in the event loop (since we aren't awaiting it?).
        // Actually, better: just use the snapshot we had and do it relative to the NEW track.
        const postSnapshot = stateRef.current;
        const currentIndex = resolveQueueIndex(postSnapshot.queue, postSnapshot.currentTrack, queueIndexRef.current);
        const tailLookaheadIdx = currentIndex + 5;
        if (tailLookaheadIdx < postSnapshot.queue.length) {
          // Never queue what the native buffer already holds past this index.
          const nativeIdx = hint?.index ?? native.index ?? 0;
          const already = new Set(trackPlayerManager.getNativeIds().slice(nativeIdx + 1));
          const nextLookahead = postSnapshot.queue
            .slice(currentIndex + 1, tailLookaheadIdx + 1)
            .filter((t) => !already.has(t.id));
          if (nextLookahead.length > 0) {
            trackPlayerManager.addNextTracks(nextLookahead).catch(() => {});
          }
        }
      }
    } catch (error) {
      console.error(`[PlayerContext] reconcile(${reason}) failed`, error);
    } finally {
      nativeTrackSyncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
    if (!state.currentTrack) return;

    const persistedQueue =
      state.originalQueue && state.originalQueue.length > 0
        ? state.originalQueue
        : [state.currentTrack];

    const runPersist = async () => {
      if (!state.currentTrack) return;
      const { position } = await trackPlayerManager.getProgress();
    persistSession(
      state.currentTrack,
      persistedQueue,
      state.queueSource ?? null,
      state.isPlaying,
      position || 0
    );
    };
    runPersist();
  }, [state]);

  useEffect(() => {
    let mounted = true;

    loadPersistedSession().then((session) => {
      if (!mounted || !session?.track) return;
      restoredSessionRef.current = session;

      const restoredQueue =
        session.queue && session.queue.length > 0
          ? session.queue
          : [session.track];

      setState((prev) => ({
        ...prev,
        currentTrack: session.track,
        originalQueue: restoredQueue,
        queue: buildQueue(session.track, restoredQueue, prev.isShuffle),
        queueSource: session.queueSource || prev.queueSource || { kind: 'manual', label: 'Current Queue' },
        recentlyPlayedTrackIds: pushRecentTrackId(prev.recentlyPlayedTrackIds, session.track.id),
        isPlaying: !!session.wasPlaying,
        isLoading: false,
      }));
    });

    // Setup TrackPlayer once
    trackPlayerManager.setup().then(async () => {
      if (!mounted) return;

      // Preserve active playback across app relaunch. Reset only when player
      // is truly idle and empty.
      const [playerProgress, playerQueue] = await Promise.all([
        trackPlayerManager.getProgress(),
        trackPlayerManager.getQueue(),
      ]);
      const hasActiveSession = playerProgress.isPlaying || playerQueue.length > 0;

      // Setup progress updates — we no longer sync position to React state
      // to avoid full-app re-renders 10x per second. Components should use
      // useProgress() from react-native-track-player directly.
      trackPlayerManager.setOnProgress((playerState) => {
        const snapshot = stateRef.current;
        const currentTrackSnapshot = snapshot.currentTrack;
        const nativeTrackId = activeNativeTrackIdRef.current;
        // Prefer native active track id. If unavailable, fall back to current
        // React track only when not loading, to avoid transition-time poisoning.
        const progressTrackId =
          nativeTrackId ||
          (!snapshot.isLoading && currentTrackSnapshot ? currentTrackSnapshot.id : null);
        if (progressTrackId) {
          lastProgressRef.current = {
            trackId: progressTrackId,
            position: Math.max(0, Number(playerState.position) || 0),
            duration: Math.max(0, Number(playerState.duration) || 0),
            at: Date.now(),
          };
        }

        // Handle 50% scrobble logic
        if (currentTrackSnapshot && !currentTrackSnapshot.id.startsWith('news-')) {
          const currentDuration = playerState.duration > 0 ? playerState.duration : (currentTrackSnapshot.duration * 1000);
          if (currentDuration > 0 && playerState.position >= currentDuration / 2) {
            if (scrobbledTrackIdRef.current !== currentTrackSnapshot.id) {
              scrobbledTrackIdRef.current = currentTrackSnapshot.id;
              scrobble(currentTrackSnapshot.id, true).catch(err => console.error('[PlayerContext] 50% Scrobble failed', err));
              console.log('[PlayerContext] Sent 50% true scrobble for', currentTrackSnapshot.id);
            }
          }
        }
      });

      trackPlayerManager.setOnPlaybackState((playerState) => {
        if (playerState.isPlaying) {
          pausedByUserRef.current = false;
          playTransitionInFlightRef.current = false;
        } else if (playerState.isLoading) {
          pausedByUserRef.current = false;
        } else {
          void maybeAutoAdvanceAfterStop();
        }
        
        // Reconcile track and status on every major playback state change
        // to catch transitions that might have missed their track-changed event.
        void reconcileWithNative('playback-state-changed');
      });

      // Setup end/next/previous callbacks — all use refs so they always
      // call the latest version of next()/previous(), even after shuffle
      // rebuilds those functions.
      trackPlayerManager.setOnEnd(() => { triggerAutoNextOnce('track-end-event'); });
      trackPlayerManager.setOnNext(() => { nextRef.current(); });
      trackPlayerManager.setOnPrevious(() => { previousRef.current(); });
      trackPlayerManager.setOnActiveTrack((trackId, nativeIndex) => {
        // Native advanced but gave us no usable id (v5 strips custom fields
        // and the index map missed). Advance the logical queue ourselves so
        // the UI follows the audio. Guarded against repeats and explicit
        // transitions: only fresh indices, well clear of manual play/next.
        if (
          !trackId &&
          nativeIndex !== undefined &&
          nativeIndex !== lastAdvanceIndexRef.current &&
          !playTransitionInFlightRef.current &&
          Date.now() - lastExplicitPlayMsRef.current > 2000
        ) {
          lastAdvanceIndexRef.current = nativeIndex;
          console.log('[PlayerContext] active-track without id, logical next() at native index=', nativeIndex);
          nextRef.current();
          return;
        }
        if (nativeIndex !== undefined) lastAdvanceIndexRef.current = nativeIndex;
        void reconcileWithNative(`active-track-changed-${trackId}-${nativeIndex}`, {
          id: trackId,
          index: nativeIndex,
        });
      });

      // Always sync once after wiring callbacks so UI reflects the true native
      // playback state (especially when notification controls are active).
      void reconcileWithNative('initial-setup');

      if (hasActiveSession) {
        void reconcileWithNative('startup-active-session');
      } else {
        const sessionToResume = restoredSessionRef.current;
        if (sessionToResume?.track) {
          const restoredQueue =
            sessionToResume.queue && sessionToResume.queue.length > 0
              ? sessionToResume.queue
              : [sessionToResume.track];
          // Load silently — do NOT auto-play on cold start, even if wasPlaying was true.
          // The user should explicitly press play. RNTP is preloaded so playback starts instantly.
          await trackPlayerManager.loadTrack(sessionToResume.track, restoredQueue);
          if (sessionToResume.position > 0) {
            await trackPlayerManager.seekTo(sessionToResume.position);
          }
          setState((prev) => ({
            ...prev,
            currentTrack: sessionToResume.track,
            originalQueue: restoredQueue,
            queue: buildQueue(sessionToResume.track, restoredQueue, prev.isShuffle),
            queueSource: sessionToResume.queueSource || prev.queueSource || { kind: 'manual', label: 'Current Queue' },
            isPlaying: false,
            isLoading: false,
          }));
        }
      }
    }).catch(err => {
      console.error('[PlayerContext] TrackPlayer setup failed', err);
    });

    loadStarredTracks();

    let syncTimeout: ReturnType<typeof setTimeout> | null = null;
    const subscription = AppState.addEventListener('change', (appState) => {
      appStateRef.current = appState;
      if (appState !== 'active') {
        // Do not run stall auto-skip while app is backgrounded/inactive.
        clearWatchdog();
      }
      if (appState === 'active') {
        // Debounce: wait 300 ms before syncing so the RNTP native layer has
        // time to settle after the app comes back to the foreground. Firing
        // immediately can hit the bridge while it's still resuming, causing
        // additional latency that manifests as a UI freeze.
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => { void reconcileWithNative('app-foreground'); }, 300);
      }
    });

    return () => {
      mounted = false;
      if (syncTimeout) clearTimeout(syncTimeout);
      subscription.remove();
    };
  }, [reconcileWithNative, clearWatchdog, maybeAutoAdvanceAfterStop, triggerAutoNextOnce]);

  const loadStarredTracks = async () => {
    try {
      // Check if user is authenticated before trying to load starred tracks
      const config = await AsyncStorage.getItem('serverConfig');
      if (!config) {
        // User not logged in yet, silently skip
        return;
      }

      const { tracks } = await getStarred();
      setState(prev => ({
        ...prev,
        starredTrackIds: tracks.map(t => t.id),
      }));
    } catch (e) {
      // Silently fail - starred tracks are optional, don't show errors to user
      // Common causes: not logged in, network issues, or no starred tracks
    }
  };

  useEffect(() => {
    const manager = initCarManager();
    if (manager) {
      manager.setPlayerControls({
        play: (track, queue) => play(track, queue, true),
        setAutoQueueEnabled: (enabled) => setAutoQueueEnabled(enabled),
      });
    }
  }, []);

  const play = useCallback(async (track: Track, queue: Track[] = [], shouldPlay = true, queueSource?: QueueSource) => {
    console.log('[PlayerContext] play() called, track=', track?.id, track?.title, 'shouldPlay=', shouldPlay);
    if (track.isDir) {
      console.warn('[PlayerContext] Cannot play a directory/album directly via play(). Use playAlbum or similar.');
      return;
    }

    const requestId = ++playRequestIdRef.current;
    playTransitionInFlightRef.current = shouldPlay;
    lastExplicitPlayMsRef.current = Date.now();
    clearWatchdog();
    pausedByUserRef.current = false;

    // RSS News tracks (IDs starting with 'news-') should not pollute recently
    // played or scrobble history. Normal music from Drift Radio still scrobbles.
    const isRssNewsTrack = track.id.startsWith('news-');

    // Subsonic clients natively send external tracks (lfm:) straight to the server for streaming.
    // By attempting to 'resolve' them client-side via search3 first, we accidentally matched songs 
    // with identical titles but different artists (e.g. Meta Boy vs Lil Shine), causing false swaps!
    // So we skip local resolution entirely. Let the server handle the stream natively.
    const resolvedTrack = track;
    const baseQueue = queue.length > 0 ? queue : [track];
    // Keep upcoming external tracks in the React UI queue so next() can reach them!
    const swappedQueue = baseQueue;

    // Compute the built queue synchronously BEFORE setState so queueIndexRef is
    // set immediately and is available for the lookahead check after playTrack()
    // resolves. React's setState updater is called lazily during the render phase,
    // not at the setState() call site — reading values set inside it after an await
    // is unreliable (they may not be set yet).
    const nextQueue = buildQueue(resolvedTrack, swappedQueue, stateRef.current.isShuffle);
    queueIndexRef.current = resolveQueueIndex(nextQueue, resolvedTrack, queueIndexRef.current);

    setState((prev) => ({
      ...prev,
      isLoading: true,
      currentTrack: resolvedTrack,
      recentlyPlayedTrackIds: isRssNewsTrack
        ? prev.recentlyPlayedTrackIds
        : pushRecentTrackId(prev.recentlyPlayedTrackIds, resolvedTrack.id),
      // Keep upcoming external tracks in the React UI queue so next() can reach them!
      originalQueue: swappedQueue,
      queue: nextQueue,
      // Inherit the previous source if no explicit one is provided (e.g. auto-advancing via next())
      // so Drift Radio / playlist context stays alive across queue transitions.
      queueSource: queueSource ?? prev.queueSource ?? { kind: 'manual', label: 'Current Queue' },
    }));


    try {
      if (shouldPlay) {
        await trackPlayerManager.playTrack(resolvedTrack, swappedQueue);
      } else {
        await trackPlayerManager.loadTrack(resolvedTrack, swappedQueue);
      }

      if (requestId === playRequestIdRef.current) {
        setState((prev) => ({ 
          ...prev, 
          isPlaying: shouldPlay, 
          isLoading: false,
        }));

        if (!isRssNewsTrack && !resolvedTrack.id.startsWith('local:')) {
          scrobbledTrackIdRef.current = null; // Reset for manual play
          scrobble(resolvedTrack.id, false).catch(err => console.error('[PlayerContext] Now Playing failed', err));
        }

        if (shouldPlay) {
          const currentQueue = stateRef.current.queue;
          warmNextTracks(currentQueue, resolvedTrack.id).catch(() => {});

          // Lookahead: pre-warm the next 5 tracks into RNTP's native queue 
          // so it can advance natively without JS bridge delays.
          const lookaheadIdx = queueIndexRef.current + 1;
          const upcoming = nextQueue.slice(lookaheadIdx, lookaheadIdx + 5).filter(Boolean);
          if (upcoming.length > 0) {
            trackPlayerManager.addNextTracks(upcoming).catch(() => {});
          }

          // 15s stall watchdog: skip if RNTP is still loading and hasn't progressed
          stallWatchdogRef.current = setTimeout(async () => {
            if (requestId !== playRequestIdRef.current) return; // stale request
            if (appStateRef.current !== 'active') return;
            try {
              const live = await trackPlayerManager.getProgress();
              if (live.isLoading && !live.isPlaying && live.position < 1000) {
                // Confirm once more after a short delay to avoid transient
                // false positives from brief bridge/state inconsistencies.
                setTimeout(async () => {
                  if (requestId !== playRequestIdRef.current) return;
                  if (appStateRef.current !== 'active') return;
                  try {
                    const confirm = await trackPlayerManager.getProgress();
                    if (confirm.isLoading && !confirm.isPlaying && confirm.position < 1000) {
                      console.warn('[PlayerContext] Stall watchdog confirmed — skipping stuck track');
                      nextRef.current();
                    }
                  } catch {
                    // best-effort, never throw
                  }
                }, 2000);
              }
            } catch {
              // best-effort, never throw
            }
          }, 25000);
        }
      }
    } catch (error) {
      console.error('[PlayerContext] Playback failed', error);
      if (requestId === playRequestIdRef.current) {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    } finally {
      if (requestId === playRequestIdRef.current && !shouldPlay) {
        playTransitionInFlightRef.current = false;
      }
    }
  }, []);

  const pause = useCallback(async () => {
    clearWatchdog();
    pausedByUserRef.current = true;
    await trackPlayerManager.pause();
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, [clearWatchdog]);

  const resume = useCallback(async () => {
    pausedByUserRef.current = false;
    // If RNTP queue is empty (e.g. after app restart), session restore only
    // hydrated React state — RNTP has nothing loaded. Play the track directly.
    const rnQueue = await trackPlayerManager.getQueue();
    if (rnQueue.length === 0) {
      const track = stateRef.current.currentTrack;
      if (!track) {
        console.warn('[PlayerContext] resume: no current track to load');
        return;
      }
      console.log('[PlayerContext] resume: RNTP empty, loading track from scratch', track.id);
      // Use playTrack (not loadTrack+play) — loadTrack calls pause() which
      // can race with the subsequent play() call on a freshly prepared track.
      await trackPlayerManager.playTrack(track);
      setState((prev) => ({ ...prev, isPlaying: true }));
      return;
    }
    await trackPlayerManager.play();
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const next = useCallback(() => {
    clearWatchdog();
    pausedByUserRef.current = false;
    const { queue, currentTrack } = stateRef.current;
    if (queue.length === 0) {
      console.log('[PlayerContext] next() skip: queue empty');
      return;
    }

    const nextIndex = getNextQueueIndex(queue, currentTrack, queueIndexRef.current);
    console.log('[PlayerContext] next() resolved', {
      currentTrackId: currentTrack?.id || null,
      queueLen: queue.length,
      queueIndexRef: queueIndexRef.current,
      nextIndex,
    });
    if (nextIndex !== null) {
      queueIndexRef.current = nextIndex;
      play(queue[nextIndex], stateRef.current.originalQueue, true);
    } else {
       // End of queue: stop playback
       setState(prev => ({ ...prev, isPlaying: false }));
       trackPlayerManager.reset();
    }
  }, [play, clearWatchdog]);

  useEffect(() => {
    nextRef.current = next;
  }, [next]);
  const seek = useCallback(async (positionMs: number) => {
    clearWatchdog(); // a seek means the track is alive — cancel any pending skip
    pausedByUserRef.current = false;
    console.log(`[PlayerContext] seek requested to ${positionMs}ms`);
    const trackDuration = (stateRef.current.currentTrack?.duration || 0) * 1000;
    const liveProgress = await trackPlayerManager.getProgress().catch(() => ({ duration: 0 }));
    const liveDuration = Math.max(0, Number(liveProgress?.duration) || 0);
    const maxDuration = Math.max(trackDuration, liveDuration);
    
    const bounded = Math.max(0, Number(positionMs) || 0);
    let targetPosition = maxDuration > 0 ? Math.min(bounded, maxDuration) : bounded;

    // RNTP can be flaky on exact-end seeks; keep a tiny tail to allow natural end.
    if (maxDuration > 1500 && targetPosition >= maxDuration - 250) {
      targetPosition = maxDuration - 250;
    }

    console.log(`[PlayerContext] bounded targetPosition=${targetPosition} (max=${maxDuration})`);
    try {
      // trackPlayerManager internally converts this to seconds for TrackPlayer
      await trackPlayerManager.seekTo(targetPosition); 
      console.log(`[PlayerContext] seek success, position=${targetPosition}`);
    } catch (error) {
      console.error('[PlayerContext] Seek failed', error);
    }
  }, []);

  const previous = useCallback(async () => {
    pausedByUserRef.current = false;
    const { queue, currentTrack } = stateRef.current;
    if (queue.length === 0) return;

    const { position } = await trackPlayerManager.getProgress();
    if (position > 3000) {
      seek(0);
      return;
    }

    const previousIndex = getPreviousQueueIndex(queue, currentTrack, queueIndexRef.current);
    if (previousIndex !== null) {
      queueIndexRef.current = previousIndex;
      play(queue[previousIndex], stateRef.current.originalQueue, true);
    } else {
      seek(0);
    }
  }, [play, seek]);

  const setQueue = useCallback((queue: Track[], queueSource?: QueueSource) => {
    setState((prev) => {
      const currentOrFirst = prev.currentTrack || queue[0] || null;
      const nextQueue = currentOrFirst
        ? buildQueue(currentOrFirst, queue, prev.isShuffle)
        : queue;
      queueIndexRef.current = resolveQueueIndex(nextQueue, currentOrFirst, queueIndexRef.current);
      return {
        ...prev,
        originalQueue: queue,
        queue: nextQueue,
        queueSource: queueSource || { kind: 'manual', label: 'Current Queue' },
      };
    });
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setState((prev) => ({
      ...prev,
      originalQueue: [...prev.originalQueue, track],
      queue: [...prev.queue, track],
      queueSource: prev.queueSource || { kind: 'queue', label: 'Current Queue' },
    }));
    trackPlayerManager.addToQueue(track);
  }, []);

  const playNext = useCallback((track: Track) => {
    setState((prev) => {
      const currentIndex = prev.queue.findIndex((t) => t.id === prev.currentTrack?.id);
      const newQueue = [...prev.queue];
      newQueue.splice(currentIndex + 1, 0, track);
      return {
        ...prev,
        queue: newQueue,
      };
    });
  }, []);

  const load = useCallback(async (track: Track, queue: Track[] = [], queueSource?: QueueSource) => {
    // Similar to play but without shouldPlay: true initially
    play(track, queue, false, queueSource);
  }, [play]);

  const toggleShuffle = useCallback(() => {
    setState((prev) => {
      const newShuffle = !prev.isShuffle;
      const newQueue = prev.currentTrack 
        ? buildQueue(prev.currentTrack, prev.originalQueue, newShuffle)
        : prev.originalQueue;
      queueIndexRef.current = resolveQueueIndex(newQueue, prev.currentTrack, queueIndexRef.current);
      
      return {
        ...prev,
        isShuffle: newShuffle,
        queue: newQueue,
      };
    });
  }, []);

  const setUpcomingQueueFromCurrent = useCallback((nextTracks: Track[], autoQueueEnabled = false) => {
    setState(prev => {
      const currentIndex = resolveQueueIndex(prev.queue, prev.currentTrack, queueIndexRef.current);
      const played = prev.queue.slice(0, currentIndex + 1);
      const nextQueue = [...played, ...nextTracks];
      queueIndexRef.current = resolveQueueIndex(nextQueue, prev.currentTrack, queueIndexRef.current);
      return {
        ...prev,
        queue: nextQueue,
        autoQueueEnabled,
        queueSource: autoQueueEnabled ? { kind: 'radio', label: 'Free Play Queue' } : prev.queueSource,
      };
    });
  }, []);

  const setAutoQueueEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, autoQueueEnabled: enabled }));
  }, []);

  const isHearted = useCallback((trackId: string) => {
    return stateRef.current.starredTrackIds.includes(trackId);
  }, []);

  const toggleHeart = useCallback(async (track: Track) => {
    const isCurrentlyHearted = stateRef.current.starredTrackIds.includes(track.id);
    
    // Optimistic UI update
    setState(prev => ({
      ...prev,
      starredTrackIds: isCurrentlyHearted
        ? prev.starredTrackIds.filter(id => id !== track.id)
        : [...prev.starredTrackIds, track.id],
    }));

    // Local files have no server: heart stays device-local.
    if (track.id.startsWith('local:')) return;

    try {
      if (isCurrentlyHearted) {
        await unstar(track.id);
        removeDownload(track.id).catch((err) => {
          console.error('[PlayerContext] Failed to remove download', err);
        });
      } else {
        await star(track.id);
        downloadTrack(track).catch((err) => {
          console.error('[PlayerContext] Failed to download track', err);
        });
      }
    } catch (e) {
      console.error('[PlayerContext] Failed to toggle heart', e);
      // Rollback on error
      setState(prev => ({
        ...prev,
        starredTrackIds: isCurrentlyHearted
          ? [...prev.starredTrackIds, track.id]
          : prev.starredTrackIds.filter(id => id !== track.id),
      }));
    }
  }, []);

  const purgeTrack = useCallback(async (track: Track) => {
    if (stateRef.current.currentTrack?.id === track.id) {
      next();
    }
    setState(prev => ({
      ...prev,
      queue: prev.queue.filter(t => t.id !== track.id),
      originalQueue: prev.originalQueue.filter(t => t.id !== track.id),
      recentlyPlayedTrackIds: prev.recentlyPlayedTrackIds.filter(id => id !== track.id),
    }));
    trackPlayerManager.removeFromNativeQueue([track.id]).catch(() => {});
    if (track.id.startsWith('local:')) return; // no server or download entry
    try {
      await purgeTrackApi(track.id);
      await removeDownload(track.id);
    } catch (e) {
      console.error('Purge failed', e);
    }
  }, [next]);

  const purgeAlbum = useCallback(async (albumId: string, tracks: Track[]) => {
    const trackIds = tracks.map(t => t.id);
    if (stateRef.current.currentTrack && trackIds.includes(stateRef.current.currentTrack.id)) {
      next();
    }
    setState(prev => ({
      ...prev,
      queue: prev.queue.filter(t => !trackIds.includes(t.id)),
      originalQueue: prev.originalQueue.filter(t => !trackIds.includes(t.id)),
      recentlyPlayedTrackIds: prev.recentlyPlayedTrackIds.filter(id => !trackIds.includes(id)),
    }));
    trackPlayerManager.removeFromNativeQueue(trackIds).catch(() => {});
    if (trackIds.every((id) => id.startsWith('local:'))) return;
    try {
      await purgeAlbumApi(albumId);
      for (const id of trackIds) {
        await removeDownload(id).catch(() => {});
      }
    } catch (e) {
      console.error('Album purge failed', e);
    }
  }, [next]);

  const purgePlaylist = useCallback(async (playlistId: string, tracks: Track[]) => {
    // Safe purge: only remove playlist, don't delete tracks
    try {
      await purgePlaylistApi(playlistId);
    } catch (e) {
      console.error('Playlist purge failed', e);
    }
  }, []);

  const purgeGenre = useCallback(async (genreName: string, tracks: Track[]) => {
    const trackIds = tracks.map(t => t.id);
    if (stateRef.current.currentTrack && trackIds.includes(stateRef.current.currentTrack.id)) {
      next();
    }
    setState(prev => ({
      ...prev,
      queue: prev.queue.filter(t => !trackIds.includes(t.id)),
      originalQueue: prev.originalQueue.filter(t => !trackIds.includes(t.id)),
      recentlyPlayedTrackIds: prev.recentlyPlayedTrackIds.filter(id => !trackIds.includes(id)),
    }));
    trackPlayerManager.removeFromNativeQueue(trackIds).catch(() => {});
    if (trackIds.every((id) => id.startsWith('local:'))) return;
    try {
      await purgeGenreApi(genreName);
      for (const id of trackIds) {
        await removeDownload(id).catch(() => {});
      }
    } catch (e) {
      console.error('Genre purge failed', e);
    }
  }, [next]);

  const addToPlaylist = useCallback(async (trackId: string, playlistId: string) => {
    try {
      await updatePlaylistApi(playlistId, undefined, trackId);
    } catch (e) {
      console.error('Add to playlist failed', e);
      throw e;
    }
  }, []);

  const actions = useMemo<PlayerActionsType>(() => ({
    play,
    pause,
    resume,
    next,
    previous,
    seek,
    setQueue,
    addToQueue,
    playNext,
    load,
    toggleShuffle,
    setUpcomingQueueFromCurrent,
    setAutoQueueEnabled,
    toggleHeart,
    isHearted,
    purgeTrack,
    purgeAlbum,
    purgePlaylist,
    purgeGenre,
    addToPlaylist,
  }), [
    play,
    pause,
    resume,
    next,
    previous,
    seek,
    setQueue,
    addToQueue,
    playNext,
    load,
    toggleShuffle,
    setUpcomingQueueFromCurrent,
    setAutoQueueEnabled,
    toggleHeart,
    isHearted,
    purgeTrack,
    purgeAlbum,
    purgePlaylist,
    purgeGenre,
    addToPlaylist,
  ]);

  return (
    <PlayerActionsContext.Provider value={actions}>
      <PlayerStateContext.Provider value={state}>
        {children}
      </PlayerStateContext.Provider>
    </PlayerActionsContext.Provider>
  );
}

export function usePlayerState() {
  const context = useContext(PlayerStateContext);
  if (!context) {
    throw new Error('usePlayerState must be used within PlayerProvider');
  }
  return context;
}

export function usePlayerActions() {
  const context = useContext(PlayerActionsContext);
  if (!context) {
    throw new Error('usePlayerActions must be used within PlayerProvider');
  }
  return context;
}

export function usePlayer() {
  const state = usePlayerState();
  const actions = usePlayerActions();
  return {
    ...state,
    ...actions,
  } as PlayerContextType;
}
