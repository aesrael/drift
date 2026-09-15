jest.mock('react-native-track-player');

import TrackPlayer, { Event, State } from 'react-native-track-player';
import {
  __resetPlaybackServiceTestState,
  playbackService,
  setOnActiveTrack,
  setOnNext,
  setOnPrevious,
  setOnProgress,
  setOnStateChange,
  setOnTrackEnd,
  setSuppressTrackEnd,
} from '../playbackService';

const mockTrackPlayer = TrackPlayer as unknown as {
  getPlaybackState: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  reset: jest.Mock;
  seekTo: jest.Mock;
  getTrack: jest.Mock;
  __listeners: Map<string, (event?: any) => any>;
  __resetMock: () => void;
};

describe('playbackService', () => {
  beforeEach(async () => {
    mockTrackPlayer.__resetMock();
    __resetPlaybackServiceTestState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.useRealTimers();
    setSuppressTrackEnd(false);
    await playbackService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('wires remote next/previous callbacks', () => {
    const onNext = jest.fn();
    const onPrevious = jest.fn();
    setOnNext(onNext);
    setOnPrevious(onPrevious);

    mockTrackPlayer.__listeners.get(Event.RemoteNext)?.();
    mockTrackPlayer.__listeners.get(Event.RemotePrevious)?.();

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it('does not crash when next/previous handlers are not set', () => {
    expect(() => mockTrackPlayer.__listeners.get(Event.RemoteNext)?.()).not.toThrow();
    expect(() => mockTrackPlayer.__listeners.get(Event.RemotePrevious)?.()).not.toThrow();
  });

  it('RemotePlay resumes only when not already playing', async () => {
    mockTrackPlayer.getPlaybackState.mockResolvedValueOnce({ state: State.Paused });
    await mockTrackPlayer.__listeners.get(Event.RemotePlay)?.();
    expect(mockTrackPlayer.play).toHaveBeenCalledTimes(1);

    mockTrackPlayer.play.mockClear();
    mockTrackPlayer.getPlaybackState.mockResolvedValueOnce({ state: State.Playing });
    await mockTrackPlayer.__listeners.get(Event.RemotePlay)?.();
    expect(mockTrackPlayer.play).not.toHaveBeenCalled();
  });

  it('RemotePause and RemoteStop control player directly', async () => {
    await mockTrackPlayer.__listeners.get(Event.RemotePause)?.();
    expect(mockTrackPlayer.pause).toHaveBeenCalledTimes(1);

    await mockTrackPlayer.__listeners.get(Event.RemoteStop)?.();
    expect(mockTrackPlayer.reset).toHaveBeenCalledTimes(1);
  });

  it('RemoteSeek seeks when position is provided', async () => {
    await mockTrackPlayer.__listeners.get(Event.RemoteSeek)?.({ position: 42 });
    expect(mockTrackPlayer.seekTo).toHaveBeenCalledWith(42);

    mockTrackPlayer.seekTo.mockClear();
    await mockTrackPlayer.__listeners.get(Event.RemoteSeek)?.({});
    expect(mockTrackPlayer.seekTo).not.toHaveBeenCalled();
  });

  it('emits track end from PlaybackQueueEnded', () => {
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);
    mockTrackPlayer.__listeners.get(Event.PlaybackQueueEnded)?.({});
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('suppresses track end when suppressTrackEnd=true', () => {
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);
    setSuppressTrackEnd(true);
    mockTrackPlayer.__listeners.get(Event.PlaybackQueueEnded)?.({});
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('queue-ended event is safe when onTrackEnd is not set', () => {
    expect(() => mockTrackPlayer.__listeners.get(Event.PlaybackQueueEnded)?.({})).not.toThrow();
  });

  it('does not emit end for activeTrack undefined when there is no previous-track hint', () => {
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);
    mockTrackPlayer.__listeners.get(Event.PlaybackActiveTrackChanged)?.({ track: undefined });
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('deduplicates multiple end signals within 800ms window', () => {
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1100);

    mockTrackPlayer.__listeners.get(Event.PlaybackQueueEnded)?.({});
    mockTrackPlayer.__listeners.get(Event.PlaybackActiveTrackChanged)?.({ track: undefined, lastTrack: 'x' });

    expect(onEnd).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it('resolves active track id from event.track.id', async () => {
    const onActive = jest.fn();
    setOnActiveTrack(onActive);
    await mockTrackPlayer.__listeners.get(Event.PlaybackActiveTrackChanged)?.({ track: { id: 'abc' }, index: 3 });
    expect(onActive).toHaveBeenCalledWith('abc', 3);
  });

  it('resolves active track id via index lookup when id missing', async () => {
    const onActive = jest.fn();
    setOnActiveTrack(onActive);
    await mockTrackPlayer.__listeners.get(Event.PlaybackActiveTrackChanged)?.({ track: {}, index: 2 });
    expect(mockTrackPlayer.getTrack).toHaveBeenCalledWith(2);
    expect(onActive).toHaveBeenCalledWith('from-index', 2);
  });

  it('swallows getTrack lookup errors when resolving active track id', async () => {
    const onActive = jest.fn();
    setOnActiveTrack(onActive);
    mockTrackPlayer.getTrack.mockRejectedValueOnce(new Error('boom'));
    await mockTrackPlayer.__listeners.get(Event.PlaybackActiveTrackChanged)?.({ track: {}, index: 2 });
    expect(onActive).toHaveBeenCalledWith('', 2);
  });

  it('does nothing for active track change when no id can be resolved', async () => {
    const onActive = jest.fn();
    setOnActiveTrack(onActive);
    mockTrackPlayer.getTrack.mockResolvedValueOnce({});
    await mockTrackPlayer.__listeners.get(Event.PlaybackActiveTrackChanged)?.({ track: {}, index: 4 });
    expect(onActive).toHaveBeenCalledWith('', 4);
  });

  it('emits track end when active track becomes undefined with lastIndex/lastPosition shape', () => {
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);
    mockTrackPlayer.__listeners.get(Event.PlaybackActiveTrackChanged)?.({ track: undefined, lastIndex: 4, lastPosition: 12 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('emits track end when active track undefined has lastPosition only', () => {
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);
    mockTrackPlayer.__listeners.get(Event.PlaybackActiveTrackChanged)?.({ track: undefined, lastPosition: 9 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('propagates playback progress in milliseconds', () => {
    const onProgress = jest.fn();
    setOnProgress(onProgress);
    mockTrackPlayer.__listeners.get(Event.PlaybackProgressUpdated)?.({ position: 12.5, duration: 200 });
    expect(onProgress).toHaveBeenCalledWith({ position: 12500, duration: 200000 });
  });

  it('propagates playback state as boolean isPlaying', async () => {
    const onState = jest.fn();
    setOnStateChange(onState);
    mockTrackPlayer.getPlaybackState.mockResolvedValueOnce({ state: State.Playing });
    await mockTrackPlayer.__listeners.get(Event.PlaybackState)?.({});
    expect(onState).toHaveBeenCalledWith(true);
  });

  it('does NOT emit track end from PlaybackState ended (removed to fix release suppress races)', async () => {
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);
    mockTrackPlayer.getPlaybackState.mockResolvedValueOnce({ state: State.Ended });
    await mockTrackPlayer.__listeners.get(Event.PlaybackState)?.({ state: State.Ended });
    // PlaybackState(Ended) no longer calls emitTrackEnd — PlaybackQueueEnded is
    // the authoritative last-track signal. Removing this path eliminates a
    // suppress-window race in release (Hermes) where reset() events and natural
    // ends arrived out of order, silencing all end signals simultaneously.
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('PlaybackQueueEnded is the sole authoritative end signal (no PlaybackState dedupe needed)', async () => {
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1100);

    // PlaybackState no longer emits — only PlaybackQueueEnded does.
    mockTrackPlayer.getPlaybackState.mockResolvedValueOnce({ state: State.Ended });
    await mockTrackPlayer.__listeners.get(Event.PlaybackState)?.({ state: State.Ended });
    mockTrackPlayer.__listeners.get(Event.PlaybackQueueEnded)?.({});

    // Exactly 1 call from PlaybackQueueEnded only
    expect(onEnd).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it('ignores playback state events when state handler is not set', async () => {
    expect(async () => {
      await mockTrackPlayer.__listeners.get(Event.PlaybackState)?.({});
    }).not.toThrow();
  });

  it('ignores progress events when progress handler is not set', () => {
    expect(() => {
      mockTrackPlayer.__listeners.get(Event.PlaybackProgressUpdated)?.({ position: 1, duration: 2 });
    }).not.toThrow();
  });

  it('handles playback error by emitting end and temporary suppression', () => {
    jest.useFakeTimers();
    const onEnd = jest.fn();
    setOnTrackEnd(onEnd);

    mockTrackPlayer.__listeners.get(Event.PlaybackError)?.({ code: 'x' });
    expect(onEnd).toHaveBeenCalledTimes(1);

    // While suppressed, queue-ended should not emit.
    mockTrackPlayer.__listeners.get(Event.PlaybackQueueEnded)?.({});
    expect(onEnd).toHaveBeenCalledTimes(1);

    // Suppression clears after 2s.
    jest.advanceTimersByTime(2100);
    mockTrackPlayer.__listeners.get(Event.PlaybackQueueEnded)?.({});
    expect(onEnd).toHaveBeenCalledTimes(2);
  });
});
