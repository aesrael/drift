export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  artistId: string;
  duration: number;
  trackNumber: number;
  coverArt?: string;
  albumArtUrl?: string;
  streamUrl?: string;
  year?: number;
  starred?: string; // Date string or undefined
  isDir?: boolean;
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  artistId: string;
  coverArt?: string;
  songCount: number;
  duration: number;
  year?: number;
  created?: string;
}

export interface Artist {
  id: string;
  name: string;
  coverArt?: string;
  albumCount: number;
  playCount?: number;
}

export interface Playlist {
  id: string;
  name: string;
  coverArt?: string;
  songCount: number;
  duration: number;
  tracks?: Track[];
  entry?: Track[];
  label?: string; // For categorizing playlists (e.g., "charts")
  isChart?: boolean;
  changed?: string;
  created?: string;
}

export interface Genre {
  name: string;
  songCount: number;
}

export type QueueSourceKind =
  | 'playlist'
  | 'album'
  | 'artist'
  | 'genre'
  | 'search'
  | 'recent'
  | 'top'
  | 'downloads'
  | 'radio'
  | 'manual'
  | 'queue';

export interface QueueSource {
  kind: QueueSourceKind;
  id?: string;
  label: string;
}

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  originalQueue: Track[];
  queueSource: QueueSource | null;
  recentlyPlayedTrackIds: string[];
  starredTrackIds: string[];
  isPlaying: boolean;
  isShuffle: boolean;
  autoQueueEnabled: boolean;
  isLoading: boolean;
  savedContextQueue?: Track[];
}
