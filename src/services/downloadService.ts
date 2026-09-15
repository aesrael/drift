import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../types';
import { getStreamUrl, getStarred } from './subsonic';

const STAR_SYNC_MAX_CONCURRENT = 1;
const STAR_SYNC_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncStarredDownloads(): Promise<void> {
  try {
    const { tracks } = await getStarred();
    const manifest = await getManifest();
    
    // Track what we already have on disk by Artist - Title to prevent redundant downloads
    const existingOnDisk = new Set<string>();
    for (const track of Object.values(manifest)) {
      existingOnDisk.add(`${track.title.toLowerCase().trim()}|${track.artist.toLowerCase().trim()}`);
    }

    const pendingDownloads: Track[] = [];

    for (const track of tracks) {
      const titleKey = `${track.title.toLowerCase().trim()}|${track.artist.toLowerCase().trim()}`;
      
      // 1. Skip if we already have this specific ID in manifest AND file exists
      if (manifest[track.id]) {
        const uri = getDownloadUri(track.id);
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && (info as any).size > 1024) continue;
      }

      // 2. Skip if we already have this exact song (Title + Artist) under a DIFFERENT ID
      if (existingOnDisk.has(titleKey)) {
        continue;
      }

      pendingDownloads.push(track);
      existingOnDisk.add(titleKey); // Mark as "queued for download" so we don't trigger it twice in this loop
    }

    if (pendingDownloads.length === 0) {
      return;
    }

    let nextIndex = 0;
    const workerCount = Math.min(STAR_SYNC_MAX_CONCURRENT, pendingDownloads.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= pendingDownloads.length) {
          return;
        }

        const track = pendingDownloads[currentIndex];
        try {
          await downloadTrack(track);
        } catch {
          // best-effort
        }

        if (STAR_SYNC_DELAY_MS > 0) {
          await sleep(STAR_SYNC_DELAY_MS);
        }
      }
    });

    await Promise.all(workers);
  } catch {
    // offline or server error — nothing to do
  }
}


// @ts-ignore
const DOWNLOADS_DIR = `${FileSystem.documentDirectory}downloads/`;
const MANIFEST_KEY = 'drift_downloads_manifest';

function getEncodedFileName(trackId: string): string {
  return `${encodeURIComponent(trackId)}.mp3`;
}

function getDownloadUri(trackId: string): string {
  return `${DOWNLOADS_DIR}${getEncodedFileName(trackId)}`;
}

function getLegacyDownloadUri(trackId: string): string {
  return `${DOWNLOADS_DIR}${trackId}.mp3`;
}

export interface DownloadedTrack extends Track {
  localUri: string;
}

// Ensure downloads directory exists
async function ensureDir() {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
  }
}

async function getManifest(): Promise<Record<string, DownloadedTrack>> {
  const data = await AsyncStorage.getItem(MANIFEST_KEY);
  return data ? JSON.parse(data) : {};
}

async function saveManifest(manifest: Record<string, DownloadedTrack>) {
  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

export async function downloadTrack(track: Track): Promise<void> {
  await ensureDir();
  const manifest = await getManifest();

  if (manifest[track.id]) {
    const uri = getDownloadUri(track.id);
    const legacyUri = getLegacyDownloadUri(track.id);
    const info = await FileSystem.getInfoAsync(uri);
    const legacyInfo = await FileSystem.getInfoAsync(legacyUri);
    if (info.exists && (info as any).size > 1024) {
      return; // Already downloaded and file exists
    }
    if (legacyInfo.exists && (legacyInfo as any).size > 1024) {
      return; // Already downloaded with legacy file name
    }
    // File missing — fall through to re-download
  }

  const fileUri = getDownloadUri(track.id);
  const streamUrl = await getStreamUrl(track.id);

  console.log(`Downloading track ${track.id} from ${streamUrl} to ${fileUri}...`);

  const downloadResumable = FileSystem.createDownloadResumable(
    streamUrl,
    fileUri,
    {},
    (downloadProgress) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      console.log(`Download progress for ${track.id}: ${(progress * 100).toFixed(2)}%`);
    }
  );

  try {
    const result = await downloadResumable.downloadAsync();
    if (result) {
      manifest[track.id] = {
        ...track,
        localUri: result.uri,
      };
      await saveManifest(manifest);
      console.log(`Successfully downloaded ${track.id}`);
    }
  } catch (e) {
    console.error(`Failed to download track ${track.id}`, e);
    throw e;
  }
}

export async function removeDownload(trackId: string): Promise<void> {
  const manifest = await getManifest();
  const track = manifest[trackId];

  if (!track) return;

  try {
    const candidateUris = [
      track.localUri,
      getDownloadUri(trackId),
      getLegacyDownloadUri(trackId),
    ];
    for (const uri of candidateUris) {
      if (!uri) continue;
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    }
    delete manifest[trackId];
    await saveManifest(manifest);
    console.log(`Removed download for ${trackId}`);
  } catch (e) {
    console.error(`Failed to remove download ${trackId}`, e);
  }
}

export async function isDownloaded(trackId: string): Promise<boolean> {
  return (await getLocalUri(trackId)) !== null;
}

export async function getLocalUri(trackId: string): Promise<string | null> {
  const manifest = await getManifest();
  const track = manifest[trackId];
  if (!track) return null;

  const dynamicUri = getDownloadUri(trackId);
  const legacyUri = getLegacyDownloadUri(trackId);

  const fileInfo = await FileSystem.getInfoAsync(dynamicUri);
  if (fileInfo.exists && fileInfo.size && fileInfo.size >= 1024) {
    return dynamicUri;
  }

  const legacyInfo = await FileSystem.getInfoAsync(legacyUri);
  if (legacyInfo.exists && legacyInfo.size && legacyInfo.size >= 1024) {
    return legacyUri;
  }

  delete manifest[trackId];
  await saveManifest(manifest);
  return null;
}

export async function getDownloadedTracks(): Promise<DownloadedTrack[]> {
  const manifest = await getManifest();
  const valid: DownloadedTrack[] = [];

  for (const track of Object.values(manifest)) {
    const localUri = await getLocalUri(track.id);
    if (localUri) {
      valid.push({
        ...track,
        localUri,
      });
    }
  }

  return valid;
}
