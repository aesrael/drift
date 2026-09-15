import { Track } from '../types';

function isSameTrack(a: Track, b: Track): boolean {
  if (a.title && b.title && a.artist && b.artist) {
    return (
      a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
      a.artist.trim().toLowerCase() === b.artist.trim().toLowerCase()
    );
  }
  return false;
}

function findClosestIndex(
  queue: Track[],
  fallbackIndex: number,
  predicate: (track: Track) => boolean
): number {
  if (fallbackIndex >= 0 && fallbackIndex < queue.length && predicate(queue[fallbackIndex])) {
    return fallbackIndex;
  }

  if (fallbackIndex >= 0 && fallbackIndex < queue.length) {
    for (let d = 1; d < queue.length; d += 1) {
      const right = fallbackIndex + d;
      if (right < queue.length && predicate(queue[right])) return right;
      const left = fallbackIndex - d;
      if (left >= 0 && predicate(queue[left])) return left;
    }
    return -1;
  }

  return queue.findIndex(predicate);
}

export function resolveQueueIndex(
  queue: Track[],
  currentTrack: Track | null,
  fallbackIndex: number = -1
): number {
  if (!queue.length || !currentTrack) return -1;

  const directIndex = findClosestIndex(
    queue,
    fallbackIndex,
    (t) => !!currentTrack.id && t.id === currentTrack.id
  );
  if (directIndex >= 0) return directIndex;

  const metaIndex = findClosestIndex(queue, fallbackIndex, (t) => isSameTrack(t, currentTrack));
  if (metaIndex >= 0) return metaIndex;

  if (fallbackIndex >= 0 && fallbackIndex < queue.length) return fallbackIndex;
  return -1;
}

export function getNextQueueIndex(
  queue: Track[],
  currentTrack: Track | null,
  fallbackIndex: number = -1
): number | null {
  const currentIndex = resolveQueueIndex(queue, currentTrack, fallbackIndex);
  if (currentIndex < 0 || currentIndex >= queue.length - 1) return null;
  return currentIndex + 1;
}

export function getPreviousQueueIndex(
  queue: Track[],
  currentTrack: Track | null,
  fallbackIndex: number = -1
): number | null {
  const currentIndex = resolveQueueIndex(queue, currentTrack, fallbackIndex);
  if (currentIndex <= 0) return null;
  return currentIndex - 1;
}
