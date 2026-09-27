import * as MediaLibrary from 'expo-media-library/legacy';
import { Track } from '../types';

export const LOCAL_TRACK_PREFIX = 'local:';

export function isLocalTrackId(id: string): boolean {
  return id.startsWith(LOCAL_TRACK_PREFIX);
}

export async function requestLocalAudioPermission(): Promise<boolean> {
  // Audio-only: never ask for photos/video.
  const current = await MediaLibrary.getPermissionsAsync(false, ['audio']);
  if (current.granted) return true;
  const next = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
  return next.granted;
}

function parseFileName(filename: string): { artist: string; title: string } {
  const base = filename.replace(/\.[^.]+$/, '');
  const sep = base.indexOf(' - ');
  if (sep > 0) {
    return {
      artist: base.slice(0, sep).trim() || 'Unknown Artist',
      title: base.slice(sep + 3).trim() || base,
    };
  }
  return { artist: 'Unknown Artist', title: base || filename };
}

function toTrack(asset: MediaLibrary.Asset): Track {
  const { artist, title } = parseFileName(asset.filename ?? 'Unknown');
  return {
    id: `${LOCAL_TRACK_PREFIX}${asset.id}`,
    title,
    artist,
    album: 'On this device',
    albumId: 'local-device',
    artistId: 'local-device',
    duration: Math.round(asset.duration ?? 0),
    trackNumber: 0,
    localFileUri: asset.uri,
  };
}

/** Last scan results, for resolving recently-played ids back to tracks. */
let cachedTracks: Track[] = [];

export function getCachedLocalTrack(id: string): Track | undefined {
  return cachedTracks.find((t) => t.id === id);
}

/** All on-device audio files via MediaStore. Sorted A–Z by file name. */
export async function scanLocalAudio(): Promise<Track[]> {
  const tracks: Track[] = [];
  let after: string | undefined;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'audio',
      first: 500,
      after,
      sortBy: ['default'],
    });
    for (const asset of page.assets) {
      tracks.push(toTrack(asset));
    }
    after = page.endCursor;
    hasNextPage = page.hasNextPage;
  }
  tracks.sort((a, b) => a.title.localeCompare(b.title));
  tracks.forEach((t, i) => {
    t.trackNumber = i + 1;
  });
  cachedTracks = tracks;
  return tracks;
}
