import TrackPlayer, {
  Capability,
  State,
  Track as RNTPTrack,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { Track } from '../types';
import { getStreamUrl } from './subsonic';
import { getLocalUri } from './downloadService';
import { setOnTrackEnd, setOnNext, setOnPrevious, setOnProgress, setOnStateChange, setOnActiveTrack, setSuppressTrackEnd } from './playbackService';

let isSetup = false;

export interface TrackPlayerState {
  position: number;
  duration: number;
  isPlaying: boolean;
  isLoading: boolean;
}

export interface PlaybackStatusState {
  isPlaying: boolean;
  isLoading: boolean;
}

let currentPlayingState = false;

export class TrackPlayerManager {
  private progressCallback: ((state: TrackPlayerState) => void) | null = null;
  private endCallback: (() => void) | null = null;
  private nextCallback: (() => void) | null = null;
  private previousCallback: (() => void) | null = null;
  private activeTrackCallback: ((trackId: string, index?: number) => void) | null = null;
  private playbackStateCallback: ((state: PlaybackStatusState) => void) | null = null;
  private opChain: Promise<void> = Promise.resolve();
  // Maintain a deterministic JS-side map of the native RNTP queue to bypass
  // track object field stripping on the React Native bridge. 
  private nativeIndexToId: string[] = [];
  
  private isNotInitializedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('not initialized') || message.includes('setupPlayer');
  }

  private async ensureReady(): Promise<boolean> {
    if (isSetup) return true;
    try {
      await this.setup();
      return true;
    } catch (error) {
      if (!this.isNotInitializedError(error)) {
        console.error('[TrackPlayerManager] Setup check failed', error);
      }
      return false;
    }
  }

  async setup() {
    if (isSetup) {
      return;
    }

    try {
      await TrackPlayer.setupPlayer({
        autoUpdateMetadata: true,
        autoHandleInterruptions: true,
      }).catch(err => {
        // Ignore "already initialized" errors
        if (err.message?.includes('already been initialized')) {
          isSetup = true;
          return;
        }
        throw err;
      });

      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
        },
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
          Capability.Stop,
        ],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        // Smoother slider/time updates (seconds).
        progressUpdateEventInterval: 0.25,
      });

      isSetup = true;

      // Set up event handlers
      setOnTrackEnd(() => {
        if (this.endCallback) this.endCallback();
      });
      setOnNext(() => {
        if (this.nextCallback) this.nextCallback();
      });
      setOnPrevious(() => {
        if (this.previousCallback) this.previousCallback();
      });
      setOnActiveTrack((trackId: string, index?: number) => {
        // Prefer the explicitly passed trackId (if the bridge preserved it).
        // Otherwise, use our deterministic JS-side map based on the native index.
        const idToDispatch = (typeof trackId === 'string' && trackId.length > 0)
          ? trackId
          : (typeof index === 'number' && index >= 0 && index < this.nativeIndexToId.length)
            ? this.nativeIndexToId[index]
            : trackId;

        if (this.activeTrackCallback) this.activeTrackCallback(idToDispatch, index);
      });

      setOnProgress((data) => {
        if (this.progressCallback) {
          this.progressCallback({
            position: data.position,
            duration: data.duration,
            isPlaying: currentPlayingState,
            isLoading: false,
          });
        }
      });

      setOnStateChange(async (isPlaying) => {
        let nextIsPlaying = isPlaying;
        let nextIsLoading = false;
        try {
          const state = await TrackPlayer.getPlaybackState();
          nextIsPlaying = state.state === State.Playing;
          nextIsLoading = state.state === State.Buffering || state.state === State.Loading;
        } catch (error) {
          console.error('[TrackPlayerManager] Failed to read playback state', error);
        }

        currentPlayingState = nextIsPlaying;

        if (this.playbackStateCallback) {
          this.playbackStateCallback({
            isPlaying: nextIsPlaying,
            isLoading: nextIsLoading,
          });
        }

        if (this.progressCallback) {
          TrackPlayer.getProgress().then(progress => {
            if (this.progressCallback) {
              this.progressCallback({
                position: progress.position * 1000,
                duration: progress.duration * 1000,
                isPlaying: nextIsPlaying,
                isLoading: nextIsLoading,
              });
            }
          });
        }
      });
    } catch (error) {
      console.error('[TrackPlayerManager] Setup failed', error);
      throw error;
    }
  }

  async reset() {
    try {
      setSuppressTrackEnd(true);
      await TrackPlayer.reset();
      // Keep suppress true for a short window so any PlaybackActiveTrackChanged
      // events from reset() that arrive asynchronously on the JS bridge are
      // still blocked. 300 ms is well above typical bridge round-trip latency.
      setTimeout(() => setSuppressTrackEnd(false), 300);
    } catch (error) {
      setSuppressTrackEnd(false);
      console.error('[TrackPlayerManager] Reset failed', error);
    }
  }

  setOnProgress(callback: (state: TrackPlayerState) => void) {
    this.progressCallback = callback;
  }

  setOnPlaybackState(callback: (state: PlaybackStatusState) => void) {
    this.playbackStateCallback = callback;
  }

  setOnEnd(callback: () => void) {
    this.endCallback = callback;
  }

  setOnNext(callback: () => void) {
    this.nextCallback = callback;
  }

  setOnPrevious(callback: () => void) {
    this.previousCallback = callback;
  }

  setOnActiveTrack(callback: (trackId: string, index?: number) => void) {
    this.activeTrackCallback = callback;
  }

  getNativeIdForIndex(index: number): string | undefined {
    if (index >= 0 && index < this.nativeIndexToId.length) {
      return this.nativeIndexToId[index];
    }
    return undefined;
  }

  /** Remove tracks from the native lookahead buffer so purged songs can't play on. */
  async removeFromNativeQueue(trackIds: string[]): Promise<void> {
    return this.runExclusive(async () => {
      try {
        const ids = new Set(trackIds);
        const queue = await TrackPlayer.getQueue();
        const activeIndex = await TrackPlayer.getActiveTrackIndex().catch(() => undefined);
        const removable: number[] = [];
        queue.forEach((t: any, i: number) => {
          const id = t?.id ?? t?.mediaId;
          if (typeof id === 'string' && ids.has(id) && i !== activeIndex) removable.push(i);
        });
        if (removable.length === 0) return;
        await TrackPlayer.remove(removable);
        // Re-sync the JS-side index map with the pruned native queue.
        const pruned = await TrackPlayer.getQueue();
        this.nativeIndexToId = pruned.map((t: any) => t?.id ?? t?.mediaId).filter(Boolean);
      } catch (error) {
        console.warn('[TrackPlayerManager] removeFromNativeQueue failed (non-fatal)', error);
      }
    });
  }

  // Append the next tracks to RNTP's native queue without resetting.
  // Maintains a resilient lookahead window natively in ExoPlayer/AVQueuePlayer.
  async addNextTracks(tracks: Track[]): Promise<void> {
    return this.runExclusive(async () => {
      try {
        const rnTracks = await Promise.all(tracks.map(t => this.convertTrack(t)));
        await TrackPlayer.add(rnTracks);
        this.nativeIndexToId.push(...tracks.map(t => t.id));
        console.log('[TrackPlayerManager] addNextTracks queued ids=', tracks.map(t => t.id).join(', '));
      } catch (error) {
        // Non-fatal — lookahead is best-effort.
        console.warn('[TrackPlayerManager] addNextTracks failed (non-fatal)', error);
      }
    });
  }

  async convertTrack(track: Track): Promise<RNTPTrack> {
    console.log('[TrackPlayerManager] convertTrack id=', track.id);
    let url: string;
    // On-device file (local library scan) — no server or download lookup needed.
    if (track.localFileUri) {
      console.log('[TrackPlayerManager] using local file uri');
      url = track.localFileUri;
    } else {
      const localUri = await getLocalUri(track.id);
      if (localUri) {
        console.log('[TrackPlayerManager] using local uri');
        url = localUri;
      } else {
        url = await getStreamUrl(track.id);
        console.log('[TrackPlayerManager] using stream url=', url);
      }
    }

    return {
      url,
      title: track.title,
      artist: track.artist || 'Unknown Artist',
      album: track.album,
      artwork: track.albumArtUrl,
      duration: track.duration,
      // v4 echoes custom id, v5 keys tracks by mediaId — send both.
      id: track.id,
      mediaId: track.id,
    };
  }

  private buildNativeQueueMinimal(track: Track): Track[] {
    // Keep RNTP queue minimal (current track only).
    // Logical queue + next/previous are handled in JS to avoid heavy
    // per-track URL resolution on every play/next.
    return [track];
  }

  async playTrack(track: Track, queue: Track[] = []) {
    return this.runExclusive(async () => {
      try {
        await this.setup();
        console.log('[TrackPlayerManager] playTrack id=', track.id);

        setSuppressTrackEnd(true);
        await TrackPlayer.reset();
        console.log('[TrackPlayerManager] reset done, converting track');
        const nativeQueue = this.buildNativeQueueMinimal(track);
        const queueToPlay = await Promise.all(nativeQueue.map((q) => this.convertTrack(q)));
        console.log('[TrackPlayerManager] adding queue to RNTP, size=', queueToPlay.length);
        this.nativeIndexToId = nativeQueue.map(q => q.id);
        await TrackPlayer.add(queueToPlay);
        console.log('[TrackPlayerManager] calling play');
        await TrackPlayer.play();
        console.log('[TrackPlayerManager] play() called successfully');
        // Explicitly clear suppress now that reset+add+play have all settled.
        // We do NOT rely on PlaybackActiveTrackChanged to clear this because
        // reset() and add() both fire that event asynchronously and can arrive
        // out-of-order, creating a race that triggers spurious onTrackEnd calls.
        setSuppressTrackEnd(false);
      } catch (error) {
        setSuppressTrackEnd(false);
        console.error('[TrackPlayerManager] playTrack failed', error);
        throw error;
      }
    });
  }

  async loadTrack(track: Track, queue: Track[] = []) {
    return this.runExclusive(async () => {
      try {
        await this.setup();

        setSuppressTrackEnd(true);
        await TrackPlayer.reset();
        const nativeQueue = this.buildNativeQueueMinimal(track);
        const queueToLoad = await Promise.all(nativeQueue.map((q) => this.convertTrack(q)));
        this.nativeIndexToId = nativeQueue.map(q => q.id);
        await TrackPlayer.add(queueToLoad);
        await TrackPlayer.pause();
        // Explicitly clear suppress now that reset+add+pause have settled.
        setSuppressTrackEnd(false);
      } catch (error) {
        setSuppressTrackEnd(false);
        console.error('[TrackPlayerManager] Load failed', error);
        throw error;
      }
    });
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opChain.then(fn, fn);
    this.opChain = next.then(() => undefined, () => undefined);
    return next;
  }

  async play() {
    try {
      await TrackPlayer.play();
    } catch (error) {
      console.error('[TrackPlayerManager] Play failed', error);
      throw error;
    }
  }

  async pause() {
    try {
      await TrackPlayer.pause();
    } catch (error) {
      console.error('[TrackPlayerManager] Pause failed', error);
      throw error;
    }
  }

  async seekTo(position: number) {
    try {
      console.log(`[TrackPlayerManager] seekTo ms=${position}, resolving to sec=${position / 1000}`);
      // TrackPlayer uses seconds, we use milliseconds
      await TrackPlayer.seekTo(position / 1000);
    } catch (error) {
      console.error('[TrackPlayerManager] Seek failed', error);
      throw error;
    }
  }

  async skipToNext() {
    try {
      await TrackPlayer.skipToNext();
    } catch (error) {
      console.error('[TrackPlayerManager] Skip to next failed', error);
      throw error;
    }
  }

  async skipToPrevious() {
    try {
      await TrackPlayer.skipToPrevious();
    } catch (error) {
      console.error('[TrackPlayerManager] Skip to previous failed', error);
      throw error;
    }
  }

  async getCurrentTrackIndex(): Promise<number | undefined> {
    try {
      const ready = await this.ensureReady();
      if (!ready) return undefined;
      return await TrackPlayer.getActiveTrackIndex();
    } catch (error) {
      if (!this.isNotInitializedError(error)) {
        console.error('[TrackPlayerManager] Get current track index failed', error);
      }
      return undefined;
    }
  }

  async getQueue(): Promise<RNTPTrack[]> {
    try {
      const ready = await this.ensureReady();
      if (!ready) return [];
      return await TrackPlayer.getQueue();
    } catch (error) {
      if (!this.isNotInitializedError(error)) {
        console.error('[TrackPlayerManager] Get queue failed', error);
      }
      return [];
    }
  }

  async addToQueue(track: Track) {
    try {
      const rnTrack = await this.convertTrack(track);
      await TrackPlayer.add(rnTrack);
    } catch (error) {
      console.error('[TrackPlayerManager] Add to queue failed', error);
      throw error;
    }
  }

  async setQueue(tracks: Track[]) {
    try {
      await TrackPlayer.reset();
      const rnTracks = await Promise.all(tracks.map(t => this.convertTrack(t)));
      await TrackPlayer.add(rnTracks);
    } catch (error) {
      console.error('[TrackPlayerManager] Set queue failed', error);
      throw error;
    }
  }

  async getState(): Promise<State> {
    try {
      const ready = await this.ensureReady();
      if (!ready) return State.None;
      const state = await TrackPlayer.getPlaybackState();
      return state.state;
    } catch (error) {
      if (!this.isNotInitializedError(error)) {
        console.error('[TrackPlayerManager] Get state failed', error);
      }
      return State.None;
    }
  }

  async getProgress(): Promise<TrackPlayerState> {
    try {
      const ready = await this.ensureReady();
      if (!ready) {
        return {
          position: 0,
          duration: 0,
          isPlaying: false,
          isLoading: false,
        };
      }
      const progress = await TrackPlayer.getProgress();
      const state = await TrackPlayer.getPlaybackState();

      return {
        position: (progress?.position ?? 0) * 1000,
        duration: (progress?.duration ?? 0) * 1000,
        isPlaying: state.state === State.Playing,
        isLoading: state.state === State.Buffering || state.state === State.Loading,
      };
    } catch (error) {
      if (!this.isNotInitializedError(error)) {
        console.error('[TrackPlayerManager] Get progress failed', error);
      }
      return {
        position: 0,
        duration: 0,
        isPlaying: false,
        isLoading: false,
      };
    }
  }
  async getStatusData(): Promise<{
    index: number | undefined;
    isPlaying: boolean;
    isLoading: boolean;
    position: number;
    duration: number;
  }> {
    try {
      const ready = await this.ensureReady();
      if (!ready) {
        return { index: undefined, isPlaying: false, isLoading: false, position: 0, duration: 0 };
      }
      const [index, state, progress] = await Promise.all([
        TrackPlayer.getActiveTrackIndex(),
        TrackPlayer.getPlaybackState(),
        TrackPlayer.getProgress(),
      ]);
      return {
        index,
        isPlaying: state.state === State.Playing,
        isLoading: state.state === State.Buffering || state.state === State.Loading,
        position: (progress?.position ?? 0) * 1000,
        duration: (progress?.duration ?? 0) * 1000,
      };
    } catch {
      return { index: undefined, isPlaying: false, isLoading: false, position: 0, duration: 0 };
    }
  }
}

// Export singleton instance
export const trackPlayerManager = new TrackPlayerManager();
