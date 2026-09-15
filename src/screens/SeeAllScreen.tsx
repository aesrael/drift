import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TrackItem, AlbumCardWithCover } from '../components';
import { FONT_SIZES, SPACING } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { usePlayerActions } from '../context/PlayerContext';
import { getAlbumList, getArtistAlbums, getTopSongs } from '../services/subsonic';
import { Album, Genre, Playlist, Track } from '../types';
import { Ionicons } from '@expo/vector-icons';

type SeeAllKind = 'albums' | 'tracks' | 'playlists' | 'genres';
type AlbumListType = 'random' | 'newest' | 'frequent' | 'recent' | 'starred';

interface SeeAllParams {
  title: string;
  kind: SeeAllKind;
  items?: Album[] | Track[] | Playlist[] | Genre[];
  albumListType?: AlbumListType;
  pageSize?: number;
  artistId?: string;
}

export function SeeAllScreen({ navigation, route }: any) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { title, kind, items = [], albumListType, pageSize = 20, artistId } = route.params as SeeAllParams;
  const { play } = usePlayerActions();
  const localBatchSize = 30;

  const [data, setData] = useState<(Album | Track | Playlist | Genre)[]>(items);
  const [visibleCount, setVisibleCount] = useState(localBatchSize);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const isPaginatedAlbums = kind === 'albums' && Boolean(albumListType);
  const isArtistContent = Boolean(artistId);
  const titleText = useMemo(() => title || 'See All', [title]);

  // Stable reload function for useFocusEffect - no dependencies on data/offset
  const reloadAlbums = useCallback(async () => {
    if (!albumListType && !artistId) return;
    setLoading(true);
    try {
      if (artistId && kind === 'tracks') {
        // fetch by artist name via title param
        const tracks = await getTopSongs(100, title);
        setData(tracks);
        setHasMore(false);
      } else if (artistId && kind === 'albums') {
        const albums = await getArtistAlbums(artistId);
        setData(albums);
        setHasMore(false);
      } else {
        const firstPage = await getAlbumList(albumListType!, pageSize, 0);
        setData(firstPage);
        const reachedCap = albumListType === 'recent' && firstPage.length >= 300;
        setHasMore(firstPage.length === pageSize && !reachedCap);
      }
    } catch (error) {
      console.error('Failed to reload', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [albumListType, pageSize, artistId, kind, title]);

  // Load more function - depends on data length
  const loadMoreAlbums = useCallback(async () => {
    if (!albumListType || loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      const offset = data.length;
      const nextPage = await getAlbumList(albumListType, pageSize, offset);
      const newData = [...data, ...nextPage];
      setData(newData);
      
      const reachedCap = albumListType === 'recent' && newData.length >= 300;
      setHasMore(nextPage.length === pageSize && !reachedCap);
    } catch (error) {
      console.error('Failed to load more albums', error);
    } finally {
      setLoadingMore(false);
    }
  }, [albumListType, pageSize, data.length, loadingMore, hasMore]);


  const refreshData = useCallback(async () => {
    if (isPaginatedAlbums || isArtistContent) {
      reloadAlbums();
      return;
    }
    
    try {
      if (kind === 'playlists') {
        const { getPlaylists } = await import('../services/subsonic');
        const allPlaylists = await getPlaylists();
        
        // Helper to check if a playlist is a chart (server flag)
        const isChart = (p: Playlist) => p.isChart === true;

        if (title === 'Charts') {
           setData(allPlaylists.filter(isChart));
        } else if (title === 'Your Playlists') {
           setData(allPlaylists.filter(p => !isChart(p)));
        } else {
           // Fallback if title is generic or unknown
           setData(allPlaylists);
        }
      } else if (kind === 'genres') {
        const { getGenres } = await import('../services/subsonic');
        const genres = await getGenres();
        setData(genres);
      }
    } catch (e) {
      console.error('Failed to refresh SeeAll data', e);
    }
  }, [isPaginatedAlbums, kind, reloadAlbums, title]);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  // Initialise data from route params once on mount only
  const initialised = React.useRef(false);
  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      if (items.length > 0) {
        setData(items);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onEndReached = () => {
    if (isPaginatedAlbums) {
      loadMoreAlbums();
      return;
    }

    if (visibleCount < data.length) {
      setVisibleCount((current) => Math.min(current + localBatchSize, data.length));
    }
  };

  const visibleData = isPaginatedAlbums ? data : data.slice(0, visibleCount);

  const renderPlaylist = (playlist: Playlist, index: number) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate('CollectionDetails', {
          type: 'playlist',
          id: playlist.id,
          name: playlist.name,
          coverArt: playlist.coverArt,
        })
      }
    >
      <Text style={styles.rowIndex}>{index + 1}</Text>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle} numberOfLines={1}>{playlist.name}</Text>
      </View>
      <Text style={styles.rowSubtitle}>{playlist.songCount || 0} tracks</Text>
    </TouchableOpacity>
  );

  const renderGenre = (genre: Genre, index: number) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate('CollectionDetails', {
          type: 'genre',
          id: genre.name,
          name: genre.name,
        })
      }
    >
      <Text style={styles.rowIndex}>{index + 1}</Text>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle} numberOfLines={1}>{genre.name}</Text>
      </View>
      <Text style={styles.rowSubtitle}>{genre.songCount} tracks</Text>
    </TouchableOpacity>
  );

  const renderAlbumRow = (album: Album, index: number) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate('CollectionDetails', {
          type: 'album',
          id: album.id,
          name: album.name,
          coverArt: album.coverArt,
        })
      }
    >
      <Text style={styles.rowIndex}>{index + 1}</Text>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle} numberOfLines={1}>{album.name}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{album.artist}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );

  const renderItem = ({ item, index }: { item: Album | Track | Playlist | Genre; index: number }) => {
    if (kind === 'tracks') {
      const tracks = data as Track[];
      const track = item as Track;
      return (
        <TrackItem
          track={track}
          onPress={() => play(track, tracks, true, { kind: 'queue', label: titleText })}
          showNumber
          isPlaying={false}
        />
      );
    }

    if (kind === 'albums') {
      return renderAlbumRow(item as Album, index);
    }

    if (kind === 'playlists') {
      return renderPlaylist(item as Playlist, index);
    }

    return renderGenre(item as Genre, index);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: SPACING.sm }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{titleText}</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleData}
          key="list"
          numColumns={1}
          keyExtractor={(item, index) => {
            const typedItem = item as any;
            return typedItem.id ? `${typedItem.id}-${index}` : `${typedItem.name}-${index}`;
          }}
          renderItem={renderItem}
          onEndReachedThreshold={0.5}
          onEndReached={onEndReached}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={undefined}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const createStyles = (colors: { background: string; text: string; primary: string; border: string; textMuted: string; textSecondary: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.sm,
      backgroundColor: colors.background,
    },
    backButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      marginHorizontal: SPACING.sm,
      fontSize: FONT_SIZES.xl,
      fontWeight: '700',
      color: colors.text,
    },
    listContent: {
      paddingBottom: 150,
    },
    loaderWrap: {
      paddingTop: SPACING.lg,
      alignItems: 'center',
    },
    footerLoader: {
      paddingVertical: SPACING.md,
      alignItems: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowIndex: {
      width: 24,
      color: colors.textMuted,
      fontSize: FONT_SIZES.sm,
      textAlign: 'center',
    },
    rowTextWrap: {
      flex: 1,
      marginLeft: SPACING.sm,
      marginRight: SPACING.sm,
      // Add some padding to avoid text touching the edge
    },
    rowTitle: {
      fontSize: FONT_SIZES.md,
      color: colors.text,
      fontWeight: '600',
    },
    rowSubtitle: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });
