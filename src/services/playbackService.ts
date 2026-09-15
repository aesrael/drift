import TrackPlayer, { Event, State } from 'react-native-track-player';

let onTrackEnd: (() => void) | null = null;
let onNext: (() => void) | null = null;
let onPrevious: (() => void) | null = null;
let onProgress: ((data: { position: number; duration: number }) => void) | null = null;
let onStateChange: ((isPlaying: boolean) => void) | null = null;
let onActiveTrack: ((trackId: string, index?: number) => void) | null = null;
let lastTrackEndEmitMs = 0;

export function __resetPlaybackServiceTestState() {
  onTrackEnd = null;
  onNext = null;
  onPrevious = null;
  onProgress = null;
  onStateChange = null;
  onActiveTrack = null;
  lastTrackEndEmitMs = 0;
  suppressTrackEnd = false;
}

export function setOnNext(handler: () => void) { onNext = handler; }
export function setOnPrevious(handler: () => void) { onPrevious = handler; }

// Set to true during intentional TrackPlayer.reset() calls so the
// PlaybackActiveTrackChanged event doesn't misfire onTrackEnd.
let suppressTrackEnd = false;

export function setSuppressTrackEnd(value: boolean) {
  suppressTrackEnd = value;
}

export function setOnTrackEnd(handler: () => void) {
  onTrackEnd = handler;
}

export function setOnProgress(handler: (data: { position: number; duration: number }) => void) {
  onProgress = handler;
}

export function setOnStateChange(handler: (isPlaying: boolean) => void) {
  onStateChange = handler;
}
export function setOnActiveTrack(handler: (trackId: string, index?: number) => void) {
  onActiveTrack = handler;
}

function emitTrackEnd() {
  const now = Date.now();
  // RNTP can emit both PlaybackActiveTrackChanged and PlaybackQueueEnded for
  // a single natural end. Deduplicate to avoid double-next.
  if (now - lastTrackEndEmitMs < 800) {
    console.log('[PlaybackService] emitTrackEnd skipped (dedupe window)');
    return;
  }
  lastTrackEndEmitMs = now;
  console.log('[PlaybackService] emitTrackEnd fired');
  if (onTrackEnd) onTrackEnd();
}

function hadPreviousTrack(event: any): boolean {
  if (event?.lastTrack !== undefined) return true;
  // Require lastIndex >= 0 specifically — RNTP sometimes sends -1 for
  // resets which we do not want to treat as a genuine track end.
  if (typeof event?.lastIndex === 'number' && event.lastIndex >= 0) return true;
  if (typeof event?.lastPosition === 'number' && event.lastPosition > 0) return true;
  return false;
}

export async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    // Only resume if not already playing — tapping the notification card
    // on Android fires RemotePlay even when music is mid-stream, which
    // would restart from position 0 if handled naively.
    const state = await TrackPlayer.getPlaybackState();
    if (state.state !== State.Playing) {
      TrackPlayer.play();
    }
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    // Route through PlayerContext.next() so both the logical queue and RNTP
    // stay in sync. Calling TrackPlayer.skipToNext() directly would advance
    // RNTP's internal queue independently, then PlaybackActiveTrackChanged
    // fires onTrackEnd causing a second skip.
    if (onNext) onNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    if (onPrevious) onPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.reset();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    if (event.position !== undefined) {
      await TrackPlayer.seekTo(event.position);
    }
  });

  // Fallback for devices/RNTP builds where ActiveTrackChanged(undefined) is
  // not reliably emitted on natural track end.
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    console.log('[PlaybackService] PlaybackQueueEnded, suppress=', suppressTrackEnd);
    if (!suppressTrackEnd) {
      emitTrackEnd();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
    console.error('[PlaybackService] PlaybackError:', JSON.stringify(event));
    // After a playback error, RNTP will fire PlaybackActiveTrackChanged with
    // track=undefined. Without suppression that would trigger onTrackEnd →
    // next(), causing an unwanted skip. Suppress for 2 s to absorb the event,
    // then let normal end-of-track logic resume.
    suppressTrackEnd = true;
    setTimeout(() => { suppressTrackEnd = false; }, 2000);
    // Explicitly advance the logical queue on error so the UI doesn't get
    // stuck in a loading state when the stream fails fast.
    emitTrackEnd();
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    console.log('[PlaybackService] PlaybackState event=', (event as any)?.state, 'suppress=', suppressTrackEnd);
    // NOTE: We intentionally do NOT call emitTrackEnd() here for State.Ended.
    // With the 2-track lookahead queue, RNTP advances natively so the last-track
    // case is handled by PlaybackQueueEnded below. Firing emitTrackEnd() here
    // caused suppress-window races in release (Hermes) where reset() events and
    // natural ends arrived out of order, silencing all end signals simultaneously.

    if (onStateChange) {
      const state = await TrackPlayer.getPlaybackState();
      onStateChange(state.state === State.Playing);
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
    if (onProgress) {
      onProgress({
        position: event.position * 1000,
        duration: event.duration * 1000,
      });
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
    // A new track became active — this is a normal mid-queue advancement
    // Wait, RNTP v4 sometimes fires event.track as undefined during fast native
    // inter-track transitions (metadata isn't ready). BUT event.index is accurate.
    const newIndex = (event as any)?.index;
    
    if (newIndex !== undefined) {
      console.log('[PlaybackService] PlaybackActiveTrackChanged active index=', newIndex);
      let maybeId = (event.track as any)?.id;
      
      if (!maybeId || typeof maybeId !== 'string') {
        try {
          const active = await TrackPlayer.getTrack(newIndex);
          maybeId = (active as any)?.id;
        } catch {
          // ignore lookup errors
        }
      }
      
      if (onActiveTrack) {
        onActiveTrack(maybeId || '', newIndex);
      }
      return;
    }

    // index is undefined → queue is now empty (end of RNTP queue or reset).
    // Only fire onTrackEnd if we are NOT suppressing (i.e. this is a natural
    // track end, not a reset we triggered ourselves).
    console.log(
      '[PlaybackService] PlaybackActiveTrackChanged undefined index, suppress=',
      suppressTrackEnd,
      'hadPrevious=',
      hadPreviousTrack(event)
    );
    if (!suppressTrackEnd && hadPreviousTrack(event)) {
      emitTrackEnd();
    }
  });
}
