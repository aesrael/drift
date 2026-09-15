import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { 
  getPlaylists, 
  getPlaylist, 
  getAlbum, 
  getSongsByGenre, 
  createPlaylist, 
  deletePlaylist,
  updatePlaylist,
  getAlbumList,
  getGenres,
  getDiscover,
  getRecentSongs,
} from '../services/subsonic';
import { Playlist, Track, Album } from '../types';

// Keys for caching
export const QUERY_KEYS = {
  playlists: ['playlists'],
  playlist: (id: string) => ['playlist', id],
  album: (id: string) => ['album', id],
  genre: (name: string) => ['genre', name],
};

export function usePlaylists() {
  return useQuery({
    queryKey: QUERY_KEYS.playlists,
    queryFn: () => getPlaylists(),
  });
}

export function usePlaylist(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.playlist(id),
    queryFn: () => getPlaylist(id),
    enabled: !!id,
  });
}

export function useAlbum(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.album(id),
    queryFn: () => getAlbum(id),
    enabled: !!id,
  });
}

// For PlaylistsScreen "Top Albums"
export function useAlbums(type: 'frequent' | 'recent' | 'newest' | 'starred' | 'random' = 'frequent', size: number = 10) {
  return useQuery({
    queryKey: ['albums', type, size],
    queryFn: () => getAlbumList(type, size),
  });
}

export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: () => getGenres(),
  });
}

export function useGenre(name: string) {
  return useQuery({
    queryKey: QUERY_KEYS.genre(name),
    queryFn: () => getSongsByGenre(name),
    enabled: !!name,
  });
}

export function useTopSongs() {
  return useQuery({
    queryKey: ['topSongs'],
    queryFn: () => getDiscover('personal'),
  });
}

export function useGenreInfinite(name: string, pageSize: number = 50) {
  return useInfiniteQuery({
    queryKey: ['genre', name, 'infinite'],
    queryFn: ({ pageParam = 0 }) => getSongsByGenre(name, pageSize, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If last page is full, there might be more
      return lastPage.length === pageSize ? allPages.length * pageSize : undefined;
    },
    enabled: !!name,
  });
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createPlaylist,
    onSuccess: () => {
      // Invalidate cache to refetch playlists
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.playlists });
    },
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deletePlaylist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.playlists });
    },
  });
}

export function useAddToPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trackId, playlistId }: { trackId: string; playlistId: string }) => 
      updatePlaylist(playlistId, undefined, trackId),
    onSuccess: (data, variables) => {
      // Invalidate the specific playlist so details screen updates
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.playlist(variables.playlistId) });
      // Also invalidate main list as song counts change
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.playlists });
    },
  });
}
