import { Track } from '../types';

export function isExternalTrackId(id: string): boolean {
  return (
    id.startsWith('temp-') ||
    id.startsWith('temp-track-') ||
    id.startsWith('lfm:') ||
    id.startsWith('lfm-track-') ||
    id.startsWith('spotify:') ||
    id.startsWith('spotify-track-') ||
    id.startsWith('deezer:') ||
    id.startsWith('deezer-track-')
  );
}

export function filterPlayableQueue(queue: Track[]): Track[] {
  return (queue || []).filter((t) => !!t?.id && !t.isDir && !isExternalTrackId(t.id));
}

export async function resolveExternalTrack(
  track: Track,
  searchFn: (query: string) => Promise<{ tracks: Track[] }>
): Promise<Track | null> {
  if (!track?.id || !isExternalTrackId(track.id)) return track;

  const fullQuery = `${track.title || ''} ${track.artist || ''}`.trim();
  const titleQuery = `${track.title || ''}`.trim();
  const artistQuery = `${track.artist || ''}`.trim();

  const queries = [fullQuery, titleQuery, artistQuery].filter((q) => q.length >= 2);
  try {
    for (const query of queries) {
      const result = await searchFn(query);
      const resolved = result.tracks.find(
        (t) => !!t?.id && !t.isDir && !isExternalTrackId(t.id)
      );
      if (resolved) return resolved;
    }
  } catch {
    return null;
  }

  return null;
}
