import { filterPlayableQueue, isExternalTrackId, resolveExternalTrack } from '../playerQueueUtils';
import { Track } from '../../types';

const mkTrack = (id: string, overrides: Partial<Track> = {}): Track => ({
  id,
  title: overrides.title ?? 'Song',
  artist: overrides.artist ?? 'Artist',
  artistId: overrides.artistId ?? 'artist-1',
  album: overrides.album ?? 'Album',
  albumId: overrides.albumId ?? 'album-1',
  trackNumber: overrides.trackNumber ?? 1,
  isDir: overrides.isDir ?? false,
  duration: overrides.duration ?? 180,
  coverArt: overrides.coverArt,
  ...overrides,
});

describe('playerQueueUtils', () => {
  it('detects external track ids', () => {
    expect(isExternalTrackId('lfm-track-123')).toBe(true);
    expect(isExternalTrackId('spotify-track-abc')).toBe(true);
    expect(isExternalTrackId('temp-track-xyz')).toBe(true);
    expect(isExternalTrackId('track-123')).toBe(false);
  });

  it('filters queue to playable tracks only', () => {
    const queue = [
      mkTrack('lfm-track-1'),
      mkTrack('track-2'),
      mkTrack('track-3', { isDir: true }),
      mkTrack('spotify-track-4'),
      mkTrack('track-5'),
    ];
    const filtered = filterPlayableQueue(queue);
    expect(filtered.map((t) => t.id)).toEqual(['track-2', 'track-5']);
  });

  it('resolves external track ids using search', async () => {
    const external = mkTrack('lfm-track-1', { title: 'Hey Joe', artist: 'Jimi' });
    const resolved = mkTrack('track-9', { title: 'Hey Joe', artist: 'Jimi' });

    const searchFn = async (_query: string) => ({ tracks: [resolved] });
    const result = await resolveExternalTrack(external, searchFn);
    expect(result?.id).toBe('track-9');
  });

  it('returns null when external track cannot be resolved', async () => {
    const external = mkTrack('spotify-track-1', { title: 'Unknown', artist: 'Nope' });
    const searchFn = async (_query: string) => ({ tracks: [] });
    const result = await resolveExternalTrack(external, searchFn);
    expect(result).toBeNull();
  });
});
