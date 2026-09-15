import * as Crypto from 'expo-crypto';
import { API_CONFIG } from '../constants/theme';
import { Track, Album, Artist, Playlist, Genre } from '../types';

import AsyncStorage from '@react-native-async-storage/async-storage';

const SALT = 'subsonic-player';
const playlistArtCache = new Map<string, string[]>();
const albumCoverCache = new Map<string, string | null>();
let cachedAuthParams: { serverUrl: string; query: string } | null = null;
let cachedConfigKey: string | null = null;

export function clearAuthCache() {
  cachedAuthParams = null;
  cachedConfigKey = null;
}

async function getConfig() {
  try {
    const config = await AsyncStorage.getItem('serverConfig');
    if (config) {
      return JSON.parse(config);
    }
  } catch (error) {
    console.warn('Failed to load server config', error);
  }
  return {
    serverUrl: API_CONFIG.baseUrl,
    username: API_CONFIG.username,
    password: API_CONFIG.password,
  };
}

async function generateToken(password: string, salt: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    password + salt
  );
}

export async function getAuthQueryParams() {
  return getAuthQueryParamsWithMode('token');
}

async function getAuthQueryParamsWithMode(mode: 'token' | 'plain') {
  const config = await getConfig();
  const configKey = `${config.serverUrl || ''}|${config.username || ''}|${config.password || ''}`;
  if (mode === 'token' && cachedAuthParams && cachedConfigKey === configKey) return cachedAuthParams;

  const params = new URLSearchParams({
    u: config.username,
    v: '1.16.1',
    c: 'subsonic-player',
  });

  if (mode === 'token') {
    const token = await generateToken(config.password, SALT);
    params.set('t', token);
    params.set('s', SALT);
  } else {
    params.set('p', config.password);
  }

  const authParams = {
    serverUrl: config.serverUrl,
    query: params.toString(),
  };

  if (mode === 'token') {
    cachedAuthParams = authParams;
    cachedConfigKey = configKey;
  }

  return authParams;
}

async function buildUrl(method: string, params: Record<string, string> = {}, mode: 'token' | 'plain' = 'token'): Promise<string> {
  const { serverUrl, query } = await getAuthQueryParamsWithMode(mode);
  const additionalParams = new URLSearchParams(params).toString();
  return `${serverUrl}/rest/${method}?${query}&${additionalParams}&f=json`;
}

type SubsonicError = Error & { subsonicCode?: number };

async function fetchSubsonicWithMode<T>(
  method: string,
  params: Record<string, string> = {},
  mode: 'token' | 'plain' = 'token'
): Promise<T> {
  const url = await buildUrl(method, params, mode);
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Network request failed for ${url}: ${message}`);
  }
  let json: any = null;
  let text: string | null = null;
  try {
    json = await response.json();
  } catch (error) {
    try {
      text = await response.text();
    } catch {}
  }

  if (!response.ok) {
    const detail = json?.['subsonic-response']?.error?.message || text || response.statusText;
    const error: SubsonicError = new Error(`HTTP ${response.status}: ${detail}`);
    error.subsonicCode = json?.['subsonic-response']?.error?.code;
    throw error;
  }

  if (!json || !json['subsonic-response']) {
    throw new Error('Invalid response from server');
  }

  if (json['subsonic-response'].error) {
    const message = json['subsonic-response'].error.message || 'Unknown error';
    const code = json['subsonic-response'].error.code;
    const error: SubsonicError = new Error(code ? `${message} (code ${code})` : message);
    error.subsonicCode = code;
    throw error;
  }

  return json['subsonic-response'];
}

async function fetchSubsonic<T>(method: string, params: Record<string, string> = {}): Promise<T> {
  try {
    return await fetchSubsonicWithMode<T>(method, params, 'token');
  } catch (error) {
    const subsonicError = error as SubsonicError;
    if (subsonicError?.subsonicCode === 40) {
      // Retry with plain password if token-based auth fails.
      return await fetchSubsonicWithMode<T>(method, params, 'plain');
    }
    throw error;
  }
}

export async function ping(): Promise<boolean> {
  const response = await fetchSubsonic<{ ping?: { status?: string }; status?: string }>('ping');
  if (response.ping?.status) return response.ping.status === 'ok';
  if (response.status) return response.status === 'ok';
  return true;
}

export async function getNowPlaying(): Promise<Track[]> {
  const response = await fetchSubsonic<{ nowPlaying: { nowPlaying: Track[] } }>('getNowPlaying');
  return response.nowPlaying?.nowPlaying || [];
}

export async function getLyrics(id: string): Promise<{ artist: string; title: string; value: string; synced: boolean; synced_lrc?: string }> {
  const response = await fetchSubsonic<{ lyrics: { artist: string; title: string; value: string; synced: boolean; synced_lrc?: string } }>('getLyrics', { id });
  return response.lyrics;
}

export async function scrobble(id: string, submission: boolean = true): Promise<void> {
  await fetchSubsonic('scrobble', { id, submission: submission ? 'true' : 'false' });
}

export async function star(id: string): Promise<void> {
  await fetchSubsonic('star', { id });
}

export async function unstar(id: string): Promise<void> {
  await fetchSubsonic('unstar', { id });
}

export async function getPlaylists(query?: string): Promise<Playlist[]> {
  const params: Record<string, string> = {};
  if (query) params.query = query;
  const response = await fetchSubsonic<{ playlists: { playlist: Playlist[] } }>('getPlaylists', params);
  return response.playlists?.playlist || [];
}

export async function getPlaylist(id: string): Promise<Playlist> {
  const response = await fetchSubsonic<{ playlist: Playlist }>('getPlaylist', { id });
  return response.playlist;
}

export async function getPlaylistArtUrls(playlist: Playlist, desiredCount: number = 4, cacheBust?: string): Promise<string[]> {
  const cacheKey = `${playlist.id}|${cacheBust || ''}`;
  const cached = playlistArtCache.get(cacheKey);
  // Invalidate cache if we requested more than we have, but here we likely requesting 1. 
  // Should serve specific count if cached sufficiently.
  if (cached && cached.length >= desiredCount) {
    return cached.slice(0, desiredCount);
  }

  const coverIds: string[] = [];
  const seen = new Set<string>();
  const albumIds: string[] = [];
  const seenAlbums = new Set<string>();

  const addCoverId = (coverId?: string) => {
    if (!coverId || seen.has(coverId)) return;
    seen.add(coverId);
    coverIds.push(coverId);
  };

  const addAlbumId = (albumId?: string) => {
    if (!albumId || seenAlbums.has(albumId)) return;
    seenAlbums.add(albumId);
    albumIds.push(albumId);
  };

  const resolveAlbumCoverIds = async () => {
    if (coverIds.length >= desiredCount || albumIds.length === 0) return;
    for (const albumId of albumIds) {
      if (coverIds.length >= desiredCount) break;
      let cachedCover = albumCoverCache.get(albumId);
      if (cachedCover === undefined) {
        try {
          const albumData = await getAlbum(albumId);
          cachedCover = albumData?.album?.coverArt || null;
        } catch (error) {
          console.warn(`Failed to resolve album cover for ${albumId}`, error);
          cachedCover = null;
        }
        albumCoverCache.set(albumId, cachedCover);
      }
      addCoverId(cachedCover || undefined);
    }
  };

  // User specifically requested "any song cover".
  // Accessing playlist.coverArt often returns a generated collage or generic icon from Subsonic
  // which might be what we want AVOID if it's broken or ugly, 
  // OR what we want if it's a manual cover.
  // But the user said "just any song cover", which implies they prefer track art.
  
  // Strategy: Try to get track covers first.
  const baseTracks = [...(playlist.entry || []), ...(playlist.tracks || [])];
  
  // If we have tracks in the summary, try them
  for (const track of baseTracks) {
    if (track.coverArt) {
      addCoverId(track.coverArt);
    } else {
      addAlbumId(track.albumId);
    }
    if (coverIds.length >= desiredCount) break;
  }

  await resolveAlbumCoverIds();

  // If we don't have enough, and haven't fetched details yet, fetch them
  if (coverIds.length < desiredCount) {
    // Only fetch if we really need to (i.e. we have 0 or < desired)
    // For the "1 image" case, this runs if we have 0 tracks in summary.
    try {
      const fullPlaylist = await getPlaylist(playlist.id);
      for (const track of fullPlaylist.entry || fullPlaylist.tracks || []) {
        if (track.coverArt) {
          addCoverId(track.coverArt);
        } else {
          addAlbumId(track.albumId);
        }
        if (coverIds.length >= desiredCount) break;
      }
      await resolveAlbumCoverIds();
    } catch (error) {
       console.warn(`Failed to fetch playlist details for art (${playlist.id})`, error);
    }
  }
  
  // Fallback to playlist's own cover art if we still found nothing on tracks
  if (coverIds.length < desiredCount && playlist.coverArt) {
      addCoverId(playlist.coverArt);
  }

  if (coverIds.length === 0) {
    return [];
  }

  // If requesting 1 image, request high quality.
  const imageSize = desiredCount === 1 ? 600 : (coverIds.length > 1 ? 150 : 300);
  
  const urls = await Promise.all(
    coverIds.slice(0, desiredCount).map((coverId) => getCoverArtUrl(coverId, imageSize, cacheBust))
  );

  playlistArtCache.set(cacheKey, urls);
  return urls;
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const response = await fetchSubsonic<{ playlist: Playlist }>('createPlaylist', { name });
  return response.playlist;
}

export async function deletePlaylist(id: string): Promise<void> {
  await fetchSubsonic('deletePlaylist', { id });
}

export async function updatePlaylist(id: string, name?: string, songIdToAdd?: string, songIndexToRemove?: number): Promise<void> {
  const params: Record<string, string> = { playlistId: id };
  if (name) params.name = name;
  if (songIdToAdd) params.songIdToAdd = songIdToAdd;
  if (songIndexToRemove !== undefined) params.songIndexToRemove = String(songIndexToRemove);
  await fetchSubsonic('updatePlaylist', params);
}

export async function getAlbums(): Promise<Album[]> {
  const response = await fetchSubsonic<{ albums: { album: Album[] } }>('getAlbums');
  return response.albums?.album || [];
}

export async function getAlbum(id: string): Promise<{ album: Album; tracks: Track[] }> {
  // Subsonic getAlbum return { album: { id, name, ..., song: [] } }
  // We type cast response to any to be flexible or use correct type
  const response = await fetchSubsonic<any>('getAlbum', { id });
  // response is { album: ... }
  const albumData = response.album;
  // song is usually the array of tracks
  const tracks = albumData.song || albumData.track || [];
  return { album: albumData, tracks };
}

let _artistsCache: Artist[] | null = null;

async function fetchAllArtistsFromIndex(): Promise<Artist[]> {
  const response = await fetchSubsonic<{
    artists: { index: { name: string; artist: any | any[] }[] | { name: string; artist: any | any[] } }
  }>('getArtists');
  const rawIndex = response.artists?.index;
  const indexArr = Array.isArray(rawIndex) ? rawIndex : rawIndex ? [rawIndex] : [];
  const all: Artist[] = [];
  for (const group of indexArr) {
    const entries: any[] = Array.isArray(group.artist)
      ? group.artist
      : group.artist ? [group.artist] : [];
    for (const a of entries) {
      all.push({
        id: a.id,
        name: a.name || 'Unknown',
        coverArt: a.coverArt,
        albumCount: a.albumCount || 0,
        playCount: a.playCount || 0,
      });
    }
  }
  // Sort by play count descending so top artists appear first
  all.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
  return all;
}

export async function getArtists(offset = 0, limit = 30, query?: string): Promise<{ artists: Artist[]; hasMore: boolean; total: number }> {
  // If a search query is provided, skip the cache and hit the backend directly
  if (query) {
    const response = await fetchSubsonic<{
      artists: { index: { name: string; artist: any | any[] }[] | { name: string; artist: any | any[] } }
    }>('getArtists', { query, count: String(limit), offset: String(offset) });
    const rawIndex = response.artists?.index;
    const indexArr = Array.isArray(rawIndex) ? rawIndex : rawIndex ? [rawIndex] : [];
    const results: Artist[] = [];
    for (const group of indexArr) {
      const entries: any[] = Array.isArray(group.artist) ? group.artist : group.artist ? [group.artist] : [];
      for (const a of entries) {
        results.push({ id: a.id, name: a.name || 'Unknown', coverArt: a.coverArt, albumCount: a.albumCount || 0 });
      }
    }
    return { artists: results, hasMore: results.length === limit, total: results.length };
  }
  if (!_artistsCache) {
    _artistsCache = await fetchAllArtistsFromIndex();
  }
  const slice = _artistsCache.slice(offset, offset + limit);
  return { artists: slice, hasMore: offset + limit < _artistsCache.length, total: _artistsCache.length };
}

export function clearArtistsCache() { _artistsCache = null; }

export async function getArtistAlbums(artistId: string): Promise<Album[]> {
  const response = await fetchSubsonic<{ artist: { album: any[] } }>('getArtist', { id: artistId });
  const albums = response.artist?.album || [];
  return albums.map((a: any) => ({
    id: a.id,
    name: a.name || a.title || '',
    artist: a.artist || 'Unknown Artist',
    artistId: a.artistId || artistId,
    coverArt: a.coverArt,
    songCount: a.songCount || 0,
    duration: a.duration || 0,
  }));
}

export async function getGenres(query?: string): Promise<Genre[]> {
  const params: Record<string, string> = {};
  if (query) params.query = query;
  const response = await fetchSubsonic<{ genres: { genre: any[] | any } }>('getGenres', params);
  const rawGenres = response.genres?.genre;
  const genreList = Array.isArray(rawGenres) ? rawGenres : rawGenres ? [rawGenres] : [];

  return genreList
    .map((genre: any, index: number) => ({
      name: String(genre.name || genre.value || `Genre ${index + 1}`),
      songCount: Number(genre.songCount ?? genre.valueCount ?? 0),
    }))
    .filter((genre: Genre) => genre.name.trim().length > 0);
}

export async function getStreamUrl(trackId: string): Promise<string> {
  const config = await getConfig();
  const token = await generateToken(config.password, SALT);
  // Ask server to fail fast when the track isn't cached to avoid long UI hangs.
  return `${config.serverUrl}/rest/stream?id=${encodeURIComponent(trackId)}&u=${encodeURIComponent(config.username)}&t=${token}&s=${SALT}&v=1.16.1&c=subsonic-player&f=mp3`;
}

export async function getCoverArtUrl(coverId: string, size: number = 300, cacheBust?: string): Promise<string> {
  const { serverUrl, query } = await getAuthQueryParams();
  const bust = cacheBust ? `&cb=${encodeURIComponent(cacheBust)}` : '';
  return `${serverUrl}/rest/getCoverArt?id=${encodeURIComponent(coverId)}&${query}&size=${size}${bust}`;
}

export function getCoverArtUrlSync(coverId: string, size: number = 300, cacheBust?: string): string | null {
  if (!cachedAuthParams) return null;
  const bust = cacheBust ? `&cb=${encodeURIComponent(cacheBust)}` : '';
  return `${cachedAuthParams.serverUrl}/rest/getCoverArt?id=${encodeURIComponent(coverId)}&${cachedAuthParams.query}&size=${size}${bust}`;
}

export async function search3(query: string): Promise<{ tracks: Track[]; albums: Album[]; artists: Artist[] }> {
  const response = await fetchSubsonic<{ 
    searchResult3: { 
      track?: Track[]; 
      song?: Track[]; 
      album?: Album[]; 
      artist?: Artist[] 
    } 
  }>('search3', {
    query,
    songCount: '50',
    albumCount: '20',
    artistCount: '15',
  });
  
  return {
    tracks: response.searchResult3?.song || response.searchResult3?.track || [],
    albums: response.searchResult3?.album || [],
    artists: response.searchResult3?.artist || [],
  };
}

export async function getRandomSongs(size: number = 10): Promise<Track[]> {
  const response = await fetchSubsonic<{ randomSongs: { song: Track[] } }>('getRandomSongs', { size: size.toString() });
  return response.randomSongs?.song || [];
}

export async function getAlbumList(
  type: 'random' | 'newest' | 'frequent' | 'recent' | 'starred',
  size: number = 10,
  offset: number = 0
): Promise<Album[]> {
  const response = await fetchSubsonic<{ albumList: { album: any[] } }>('getAlbumList', {
    type,
    size: size.toString(),
    offset: offset.toString(),
  });
  const albums = response.albumList?.album || [];
  
  // Log raw response to debug
  console.log('Raw album data:', JSON.stringify(albums[0]));
  
  // Map the response - Subsonic uses 'name' or 'title' for album name
  return albums.map(album => ({
    id: album.id,
    name: album.name || album.title || album.album || '',
    artist: album.artist || 'Unknown Artist',
    artistId: album.artistId || '',
    coverArt: album.coverArt,
    songCount: album.songCount || 0,
    duration: album.duration || 0,
  }));
}

export async function getStarred(): Promise<{ tracks: Track[]; albums: Album[] }> {
  const response = await fetchSubsonic<{ starred: { song: Track[]; album: Album[] } }>('getStarred');
  return {
    tracks: response.starred?.song || [],
    albums: response.starred?.album || [],
  };
}

export async function getTopSongs(count: number = 50, artist?: string): Promise<Track[]> {
  const params: Record<string, string> = { count: count.toString() };
  if (artist) {
    params.artist = artist;
  }
  const response = await fetchSubsonic<{ topSongs: { song: Track[] } }>('getTopSongs', params);
  return response.topSongs?.song || [];
}

export async function getSongsByGenre(genre: string, count: number = 50, offset: number = 0): Promise<Track[]> {
  const response = await fetchSubsonic<{ songsByGenre: { song: Track[] } }>('getSongsByGenre', { genre, count: count.toString(), offset: offset.toString() });
  return response.songsByGenre?.song || [];
}

export async function getDiscover(type: 'personal' | 'genre', name?: string): Promise<Track[]> {
  const params: Record<string, string> = { type };
  if (name) params.name = name;
  const response = await fetchSubsonic<{ randomSongs: { song: Track[] } }>('getDiscover', params);
  return response.randomSongs?.song || [];
}

export async function getRecentSongs(count: number = 50): Promise<Track[]> {
  const params: Record<string, string> = { count: count.toString() };
  // reusing TopSongs structure from server response for convenience
  const response = await fetchSubsonic<{ topSongs: { song: Track[] } }>('getRecentSongs', params);
  return response.topSongs?.song || [];
}

export async function purgeTrack(trackId: string): Promise<void> {
  await fetchSubsonic('purgeSong', { id: trackId });
}

export async function purgeAlbum(albumId: string): Promise<void> {
  await fetchSubsonic('purgeAlbum', { id: albumId });
}

export async function purgePlaylist(id: string): Promise<void> {
  await fetchSubsonic('purgePlaylist', { id });
}

export async function purgeGenre(genreName: string): Promise<void> {
  await fetchSubsonic('purgeGenre', { id: genreName });
}
