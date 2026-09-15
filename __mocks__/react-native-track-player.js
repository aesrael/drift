const listeners = new Map();

const Event = {
  RemotePlay: 'RemotePlay',
  RemotePause: 'RemotePause',
  RemoteNext: 'RemoteNext',
  RemotePrevious: 'RemotePrevious',
  RemoteStop: 'RemoteStop',
  RemoteSeek: 'RemoteSeek',
  PlaybackQueueEnded: 'PlaybackQueueEnded',
  PlaybackError: 'PlaybackError',
  PlaybackState: 'PlaybackState',
  PlaybackProgressUpdated: 'PlaybackProgressUpdated',
  PlaybackActiveTrackChanged: 'PlaybackActiveTrackChanged',
};

const State = {
  Playing: 'playing',
  Buffering: 'buffering',
  Loading: 'loading',
  Paused: 'paused',
};

const TrackPlayer = {
  addEventListener: jest.fn((event, handler) => {
    listeners.set(event, handler);
    return { remove: jest.fn() };
  }),
  getPlaybackState: jest.fn(async () => ({ state: State.Playing })),
  play: jest.fn(),
  pause: jest.fn(),
  reset: jest.fn(),
  seekTo: jest.fn(),
  getTrack: jest.fn(async () => ({ id: 'from-index' })),
  __listeners: listeners,
  __resetMock: () => {
    listeners.clear();
    TrackPlayer.addEventListener.mockClear();
    TrackPlayer.getPlaybackState.mockClear();
    TrackPlayer.play.mockClear();
    TrackPlayer.pause.mockClear();
    TrackPlayer.reset.mockClear();
    TrackPlayer.seekTo.mockClear();
    TrackPlayer.getTrack.mockClear();
    TrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });
    TrackPlayer.getTrack.mockResolvedValue({ id: 'from-index' });
  },
};

module.exports = TrackPlayer;
module.exports.default = TrackPlayer;
module.exports.Event = Event;
module.exports.State = State;
