import React from 'react';
import { act, create } from 'react-test-renderer';
import { Track } from '../../types';

const callbacks: {
  onEnd?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onActiveTrack?: (trackId: string) => void;
  onProgress?: (state: any) => void;
  onPlaybackState?: (state: any) => void;
} = {};

const mockTrackPlayerManager = {
  setup: jest.fn(async () => {}),
  getProgress: jest.fn(async () => ({ position: 0, duration: 180000, isPlaying: false, isLoading: false })),
  getQueue: jest.fn(async () => []),
  playTrack: jest.fn(async () => {}),
  loadTrack: jest.fn(async () => {}),
  addNextTracks: jest.fn(async () => {}),
  reset: jest.fn(async () => {}),
  play: jest.fn(async () => {}),
  pause: jest.fn(async () => {}),
  seekTo: jest.fn(async () => {}),
  addToQueue: jest.fn(async () => {}),
  setOnEnd: jest.fn((cb: () => void) => {
    callbacks.onEnd = cb;
  }),
  setOnNext: jest.fn((cb: () => void) => {
    callbacks.onNext = cb;
  }),
  setOnPrevious: jest.fn((cb: () => void) => {
    callbacks.onPrevious = cb;
  }),
  setOnActiveTrack: jest.fn((cb: (trackId: string) => void) => {
    callbacks.onActiveTrack = cb;
  }),
  setOnProgress: jest.fn((cb: (state: any) => void) => {
    callbacks.onProgress = cb;
  }),
  setOnPlaybackState: jest.fn((cb: (state: any) => void) => {
    callbacks.onPlaybackState = cb;
  }),
  getStatusData: jest.fn(async () => ({ index: 0, isPlaying: false, isLoading: false, position: 0, duration: 180000 })),
  getNativeIdForIndex: jest.fn((_idx?: number): string | undefined => undefined),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (_key: string) => null),
    setItem: jest.fn(async (_key: string, _value: string) => {}),
  },
}));

jest.mock('../../services/trackPlayerManager', () => ({
  __esModule: true,
  trackPlayerManager: mockTrackPlayerManager,
}));

jest.mock('../../services/subsonic', () => ({
  scrobble: jest.fn(async () => {}),
  star: jest.fn(async () => {}),
  unstar: jest.fn(async () => {}),
  getStarred: jest.fn(async () => ({ tracks: [] })),
  getStreamUrl: jest.fn(async (id: string) => `http://localhost/stream/${id}`),
  purgeTrack: jest.fn(async () => {}),
  purgeAlbum: jest.fn(async () => {}),
  purgePlaylist: jest.fn(async () => {}),
  updatePlaylist: jest.fn(async () => {}),
  purgeGenre: jest.fn(async () => {}),
  search3: jest.fn(async () => ({ tracks: [] })),
}));

jest.mock('../../services/downloadService', () => ({
  downloadTrack: jest.fn(async () => {}),
  removeDownload: jest.fn(async () => {}),
}));

jest.mock('../../car/CarManager', () => ({
  initCarManager: jest.fn(() => null),
}));

const { PlayerProvider, usePlayer } = require('../PlayerContext');

let latestPlayer: any = null;

function PlayerProbe() {
  latestPlayer = usePlayer();
  return null;
}

const makeTrack = (id: string, title: string): Track => ({
  id,
  title,
  artist: 'Artist',
  album: 'Album',
  albumId: 'album-1',
  artistId: 'artist-1',
  coverArt: '',
  albumArtUrl: '',
  isDir: false,
  duration: 180,
  trackNumber: 1,
});

describe('PlayerContext auto-advance', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    callbacks.onEnd = undefined;
    callbacks.onNext = undefined;
    callbacks.onPrevious = undefined;
    callbacks.onActiveTrack = undefined;
    callbacks.onProgress = undefined;
    callbacks.onPlaybackState = undefined;
    latestPlayer = null;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('advances to the next queue track when onEnd is emitted', async () => {
    const t1 = makeTrack('track-1', 'Track One');
    const t2 = makeTrack('track-2', 'Track Two');
    const queue = [t1, t2];

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <PlayerProvider>
          <PlayerProbe />
        </PlayerProvider>
      );
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(latestPlayer).toBeTruthy();
    expect(callbacks.onEnd).toBeDefined();

    await act(async () => {
      await latestPlayer!.play(t1, queue, true, { kind: 'playlist', id: 'pl-1', label: 'Playlist' });
      mockTrackPlayerManager.getStatusData.mockResolvedValue({ index: 0, isPlaying: true, isLoading: false, position: 0, duration: 180000 });
      mockTrackPlayerManager.getNativeIdForIndex.mockReturnValue(t1.id);
      callbacks.onActiveTrack?.(t1.id);
    });

    expect(mockTrackPlayerManager.playTrack).toHaveBeenCalledTimes(1);
    expect(mockTrackPlayerManager.playTrack).toHaveBeenLastCalledWith(t1, queue);

    await act(async () => {
      callbacks.onEnd?.();
      await Promise.resolve();
    });

    expect(mockTrackPlayerManager.playTrack).toHaveBeenCalledTimes(2);
    expect(mockTrackPlayerManager.playTrack).toHaveBeenLastCalledWith(t2, queue);
    expect(latestPlayer!.currentTrack?.id).toBe('track-2');

    await act(async () => {
      renderer!.unmount();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
  });

  it('advances when playback stops near end even if onEnd is not emitted', async () => {
    const t1 = makeTrack('track-1', 'Track One');
    const t2 = makeTrack('track-2', 'Track Two');
    const queue = [t1, t2];

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <PlayerProvider>
          <PlayerProbe />
        </PlayerProvider>
      );
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await act(async () => {
      await latestPlayer!.play(t1, queue, true, { kind: 'playlist', id: 'pl-1', label: 'Playlist' });
      mockTrackPlayerManager.getStatusData.mockResolvedValue({ index: 0, isPlaying: true, isLoading: false, position: 0, duration: 180000 });
      mockTrackPlayerManager.getNativeIdForIndex.mockReturnValue(t1.id);
      callbacks.onActiveTrack?.(t1.id);
    });

    // Simulate RNTP reporting a stopped player near the end of track 1.
    mockTrackPlayerManager.getProgress.mockResolvedValueOnce({
      position: 179500,
      duration: 180000,
      isPlaying: false,
      isLoading: false,
    });

    await act(async () => {
      callbacks.onPlaybackState?.({ isPlaying: false, isLoading: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockTrackPlayerManager.playTrack).toHaveBeenCalledTimes(2);
    expect(mockTrackPlayerManager.playTrack).toHaveBeenLastCalledWith(t2, queue);
    expect(latestPlayer!.currentTrack?.id).toBe('track-2');

    await act(async () => {
      renderer!.unmount();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
  });

  it('advances when live stop position resets but cached progress was near end', async () => {
    const t1 = makeTrack('track-1', 'Track One');
    const t2 = makeTrack('track-2', 'Track Two');
    const queue = [t1, t2];

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <PlayerProvider>
          <PlayerProbe />
        </PlayerProvider>
      );
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await act(async () => {
      await latestPlayer!.play(t1, queue, true, { kind: 'playlist', id: 'pl-1', label: 'Playlist' });
      mockTrackPlayerManager.getStatusData.mockResolvedValue({ index: 0, isPlaying: true, isLoading: false, position: 0, duration: 180000 });
      mockTrackPlayerManager.getNativeIdForIndex.mockReturnValue(t1.id);
      callbacks.onActiveTrack?.(t1.id);
    });

    // Cached progress says near end, but live progress has reset to zero.
    await act(async () => {
      callbacks.onProgress?.({ position: 179500, duration: 180000 });
      await Promise.resolve();
    });

    mockTrackPlayerManager.getProgress.mockResolvedValueOnce({
      position: 0,
      duration: 0,
      isPlaying: false,
      isLoading: false,
    });

    await act(async () => {
      callbacks.onPlaybackState?.({ isPlaying: false, isLoading: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockTrackPlayerManager.playTrack).toHaveBeenCalledTimes(2);
    expect(mockTrackPlayerManager.playTrack).toHaveBeenLastCalledWith(t2, queue);
    expect(latestPlayer!.currentTrack?.id).toBe('track-2');

    await act(async () => {
      renderer!.unmount();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
  });

  it('advances when duration is unknown but track had meaningful progress', async () => {
    const t1 = { ...makeTrack('track-1', 'Track One'), duration: 0 };
    const t2 = makeTrack('track-2', 'Track Two');
    const queue = [t1, t2];

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <PlayerProvider>
          <PlayerProbe />
        </PlayerProvider>
      );
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await act(async () => {
      await latestPlayer!.play(t1, queue, true, { kind: 'playlist', id: 'pl-1', label: 'Playlist' });
      mockTrackPlayerManager.getStatusData.mockResolvedValue({ index: 0, isPlaying: true, isLoading: false, position: 0, duration: 0 });
      mockTrackPlayerManager.getNativeIdForIndex.mockReturnValue(t1.id);
      callbacks.onActiveTrack?.(t1.id);
    });

    // No usable duration, but we observed several seconds of progress.
    await act(async () => {
      callbacks.onProgress?.({ position: 5500, duration: 0 });
      await Promise.resolve();
    });

    mockTrackPlayerManager.getProgress.mockResolvedValueOnce({
      position: 0,
      duration: 0,
      isPlaying: false,
      isLoading: false,
    });

    await act(async () => {
      callbacks.onPlaybackState?.({ isPlaying: false, isLoading: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockTrackPlayerManager.playTrack).toHaveBeenCalledTimes(2);
    expect(mockTrackPlayerManager.playTrack).toHaveBeenLastCalledWith(t2, queue);
    expect(latestPlayer!.currentTrack?.id).toBe('track-2');

    await act(async () => {
      renderer!.unmount();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
  });

  it('adds lookahead track to RNTP queue after play() starts', async () => {
    const t1 = makeTrack('track-1', 'Track One');
    const t2 = makeTrack('track-2', 'Track Two');
    const t3 = makeTrack('track-3', 'Track Three');
    const queue = [t1, t2, t3];

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <PlayerProvider>
          <PlayerProbe />
        </PlayerProvider>
      );
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await act(async () => {
      await latestPlayer!.play(t1, queue, true, { kind: 'playlist', id: 'pl-1', label: 'Playlist' });
    });

    // The lookahead (t2, t3) should have been added to RNTP queue after play(t1) succeeds
    expect(mockTrackPlayerManager.addNextTracks).toHaveBeenCalledWith([t2, t3]);

    await act(async () => {
      renderer!.unmount();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
  });

  it('advances via native RNTP track change (setOnActiveTrack) and rolls lookahead', async () => {
    const t1 = makeTrack('track-1', 'Track One');
    const t2 = makeTrack('track-2', 'Track Two');
    const t3 = makeTrack('track-3', 'Track Three');
    const queue = [t1, t2, t3];

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <PlayerProvider>
          <PlayerProbe />
        </PlayerProvider>
      );
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await act(async () => {
      await latestPlayer!.play(t1, queue, true, { kind: 'playlist', id: 'pl-1', label: 'Playlist' });
    });

    mockTrackPlayerManager.addNextTracks.mockClear();

    // Simulate RNTP natively advancing to t2 (consumed the lookahead)
    await act(async () => {
      mockTrackPlayerManager.getStatusData.mockResolvedValueOnce({ index: 1, isPlaying: true, isLoading: false, position: 0, duration: 180000 });
      mockTrackPlayerManager.getNativeIdForIndex.mockReturnValueOnce(t2.id);
      callbacks.onActiveTrack?.(t2.id);
      await Promise.resolve();
    });

    // React state should update to track-2
    expect(latestPlayer!.currentTrack?.id).toBe('track-2');
    // Rolling window: we advanced from t1 to t2, queue is [t1, t2, t3].
    // t2 index is 1. tailLookaheadIdx is 1 + 5 = 6. 
    // Since queue length is 3, index 6 doesn't exist, so addNextTracks shouldn't be called.
    expect(mockTrackPlayerManager.addNextTracks).not.toHaveBeenCalled();

    await act(async () => {
      renderer!.unmount();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
  });
});
