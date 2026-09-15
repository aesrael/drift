import { Track } from '../../types';
import { getNextQueueIndex, getPreviousQueueIndex, resolveQueueIndex } from '../playerNavigationUtils';

const mkTrack = (id: string, title = `title-${id}`, artist = `artist-${id}`): Track => ({
  id,
  title,
  artist,
  album: 'album',
  albumId: 'album-1',
  artistId: 'artist-1',
  isDir: false,
  duration: 180,
  trackNumber: 1,
});

describe('playerNavigationUtils', () => {
  it('resolves by exact id', () => {
    const queue = [mkTrack('a'), mkTrack('b'), mkTrack('c')];
    expect(resolveQueueIndex(queue, mkTrack('b'), -1)).toBe(1);
  });

  it('falls back to title+artist when id differs', () => {
    const queue = [mkTrack('x1', 'Hello', 'A'), mkTrack('x2', 'World', 'B')];
    const current = mkTrack('other-id', 'World', 'B');
    expect(resolveQueueIndex(queue, current, -1)).toBe(1);
  });

  it('uses fallback index when current cannot be resolved', () => {
    const queue = [mkTrack('a'), mkTrack('b'), mkTrack('c')];
    expect(resolveQueueIndex(queue, mkTrack('z'), 2)).toBe(2);
  });

  it('returns -1 when queue is empty or current missing', () => {
    expect(resolveQueueIndex([], mkTrack('a'), 0)).toBe(-1);
    expect(resolveQueueIndex([mkTrack('a')], null, 0)).toBe(-1);
    // No metadata match either
    const partial = { ...mkTrack('x'), title: '', artist: '' };
    expect(resolveQueueIndex([mkTrack('a')], partial, -1)).toBe(-1);
  });

  it('computes next index correctly', () => {
    const queue = [mkTrack('a'), mkTrack('b'), mkTrack('c')];
    expect(getNextQueueIndex(queue, mkTrack('a'), -1)).toBe(1);
    expect(getNextQueueIndex(queue, mkTrack('c'), -1)).toBeNull();
  });

  it('computes previous index correctly', () => {
    const queue = [mkTrack('a'), mkTrack('b'), mkTrack('c')];
    expect(getPreviousQueueIndex(queue, mkTrack('c'), -1)).toBe(1);
    expect(getPreviousQueueIndex(queue, mkTrack('a'), -1)).toBeNull();
  });

  it('next/previous use fallback index when id mismatch occurs mid-session', () => {
    const queue = [mkTrack('a'), mkTrack('b'), mkTrack('c')];
    const unknown = mkTrack('not-in-queue');
    expect(getNextQueueIndex(queue, unknown, 1)).toBe(2);
    expect(getPreviousQueueIndex(queue, unknown, 1)).toBe(0);
  });

  it('prefers closest duplicate id using fallback index', () => {
    const queue = [
      mkTrack('dup', 'Song', 'Artist'),
      mkTrack('x'),
      mkTrack('dup', 'Song', 'Artist'),
      mkTrack('y'),
    ];
    expect(resolveQueueIndex(queue, mkTrack('dup', 'Song', 'Artist'), 2)).toBe(2);
    expect(resolveQueueIndex(queue, mkTrack('dup', 'Song', 'Artist'), 0)).toBe(0);
  });

  it('advances correctly with duplicate ids near current index', () => {
    const queue = [
      mkTrack('a'),
      mkTrack('dup', 'Same', 'Artist'),
      mkTrack('dup', 'Same', 'Artist'),
      mkTrack('z'),
    ];
    const current = mkTrack('dup', 'Same', 'Artist');
    expect(getNextQueueIndex(queue, current, 1)).toBe(2);
    expect(getNextQueueIndex(queue, current, 2)).toBe(3);
  });

  it('resolves closest match by scanning both right and left from fallback index', () => {
    const queue = [mkTrack('a'), mkTrack('dup'), mkTrack('x'), mkTrack('dup'), mkTrack('z')];
    const current = mkTrack('dup');
    expect(resolveQueueIndex(queue, current, 2)).toBe(3); // right-first at equal distance
    expect(resolveQueueIndex(queue, current, 4)).toBe(3); // left scan
  });

  it('falls back to global findIndex when fallback index is out of bounds', () => {
    const queue = [mkTrack('a'), mkTrack('b'), mkTrack('c')];
    expect(resolveQueueIndex(queue, mkTrack('b'), 99)).toBe(1);
    expect(resolveQueueIndex(queue, mkTrack('b'), -2)).toBe(1);
  });

  it('returns -1 when no match exists in bounded fallback scan', () => {
    const queue = [mkTrack('a'), mkTrack('b')];
    expect(resolveQueueIndex(queue, mkTrack('z'), 1)).toBe(1); // bounded fallback wins
    expect(resolveQueueIndex(queue, mkTrack('z'), -1)).toBe(-1); // no bounded fallback
  });

  it('uses default fallback index when omitted', () => {
    const queue = [mkTrack('a'), mkTrack('b'), mkTrack('c')];
    expect(resolveQueueIndex(queue, mkTrack('b'))).toBe(1);
    expect(getNextQueueIndex(queue, mkTrack('b'))).toBe(2);
    expect(getPreviousQueueIndex(queue, mkTrack('b'))).toBe(0);
  });
});
