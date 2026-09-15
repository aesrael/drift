import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform, RefreshControl } from 'react-native';
import { AlbumCardWithCover, TrackItem } from '../components';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { usePlayerActions } from '../context/PlayerContext';
import { search3 } from '../services/subsonic';
import { Album, Artist, Track } from '../types';

export function SearchScreen({ navigation }: any) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { play } = usePlayerActions();

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (trimmedQuery.length < 5) {
      setTracks([]);
      setAlbums([]);
      setArtists([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await search3(trimmedQuery);
        setTracks(result.tracks);
        setAlbums(result.albums);
        setArtists(result.artists);
      } catch (e) {
        console.error('Search failed', e);
        setError('Search failed. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  const handleTrackPress = (track: Track) => {
    play(track, tracks, true, { kind: 'search', label: trimmedQuery ? `Search: ${trimmedQuery}` : 'Search Results' });
  };

  const onRefresh = async () => {
    if (trimmedQuery.length < 5) return;
    setIsRefreshing(true);
    try {
      const result = await search3(trimmedQuery);
      setTracks(result.tracks);
      setAlbums(result.albums);
      setArtists(result.artists);
      setError(null);
    } catch (e) {
      console.error('Refresh search failed', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const hasResults = tracks.length > 0 || albums.length > 0 || artists.length > 0;

  return (
    <View style={styles.container}>
      <View style={[styles.searchHeader, { paddingTop: SPACING.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search songs, albums, artists"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>


      {isLoading && (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {!isLoading && error && (
        <View style={styles.stateWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!isLoading && !error && trimmedQuery.length > 0 && trimmedQuery.length < 5 && (
        <View style={styles.stateWrap}>
          <Text style={styles.hintText}>Type at least 5 characters to search.</Text>
        </View>
      )}

      {!isLoading && !error && trimmedQuery.length >= 5 && !hasResults && (
        <View style={styles.stateWrap}>
          <Text style={styles.hintText}>No results for "{trimmedQuery}".</Text>
        </View>
      )}

      {!isLoading && !error && hasResults && (
        <FlatList
          data={tracks}
          keyExtractor={(item) => `track-${item.id}`}
          renderItem={({ item }) => (
            <TrackItem
              track={item}
              onPress={() => handleTrackPress(item)}
            />
          )}
          ListHeaderComponent={
            <View>
              {albums.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Albums</Text>
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('SeeAll', {
                          title: 'Albums',
                          kind: 'albums',
                          items: albums,
                        })
                      }
                    >
                      <Text style={styles.seeAllText}>See All</Text>
                    </TouchableOpacity>
                  </View>
                  <FlatList
                    horizontal
                    data={albums}
                    keyExtractor={(item) => `album-${item.id}`}
                    renderItem={({ item }) => (
                      <View style={styles.albumCardWrap}>
                        <AlbumCardWithCover
                          name={item.name}
                          artist={item.artist}
                          coverArtId={item.coverArt}
                          onPress={() =>
                            navigation.navigate('CollectionDetails', {
                              type: 'album',
                              id: item.id,
                              name: item.name,
                              coverArt: item.coverArt,
                            })
                          }
                        />
                      </View>
                    )}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </View>
              )}

              {artists.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Artists</Text>
                  <FlatList
                    horizontal
                    data={artists}
                    keyExtractor={(item) => `artist-${item.id}`}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.artistPill}>
                        <Text style={styles.artistName} numberOfLines={1}>{item.name}</Text>
                      </TouchableOpacity>
                    )}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </View>
              )}

              {tracks.length > 0 && (
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Tracks</Text>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('SeeAll', {
                        title: 'Tracks',
                        kind: 'tracks',
                        items: tracks,
                      })
                    }
                  >
                    <Text style={styles.seeAllText}>See All</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          }
          contentContainerStyle={styles.trackListContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        />
      )}
    </View>
  );
}

const createStyles = (colors: { background: string; border: string; surfaceLight: string; text: string; textMuted: string; primary: string; textSecondary: string; error: string; surface: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    searchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    backBtn: {
      padding: SPACING.xs,
    },
    searchRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 42,
      borderRadius: 10,
      backgroundColor: colors.surfaceLight,
      paddingHorizontal: SPACING.sm,
      gap: SPACING.xs,
    },
    searchInput: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      color: colors.text,
      height: '100%',
    },
    clearButton: {
      padding: SPACING.xs,
    },
    stateWrap: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
    },
    hintText: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.md,
    },
    errorText: {
      color: colors.error,
      fontSize: FONT_SIZES.md,
    },
    section: {
      marginBottom: SPACING.md,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: SPACING.sm,
      paddingHorizontal: SPACING.md,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
    },
    seeAllText: {
      color: colors.primary,
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
    },
    horizontalList: {
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    albumCardWrap: {
      width: 140,
    },
    artistPill: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: 180,
    },
    artistName: {
      fontSize: FONT_SIZES.sm,
      color: colors.text,
      fontWeight: '600',
    },
    trackListContent: {
      paddingBottom: 150,
    },
  });
