import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, Alert, TextInput, RefreshControl } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { Track, Album, Playlist } from '../types';
import { getAlbum, getPlaylist, getSongsByGenre, getCoverArtUrl, search3, getPlaylistArtUrls, updatePlaylist, star, unstar } from '../services/subsonic';
import { usePlayerActions, usePlayerState } from '../context/PlayerContext';
import { TrackItem } from '../components';
import { Ionicons } from '@expo/vector-icons';
import { formatTotalDuration, calculateTotalDuration } from '../utils/format';
import { getColors, type ImageColorsResult } from 'react-native-image-colors';

type CollectionType = 'album' | 'playlist' | 'genre';

interface RouteParams {
  type: CollectionType;
  id: string; // id for album/playlist, genre name for genre
  name: string;
  coverArt?: string; // Optional initial cover
}

export function CollectionDetailsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { type, id, name, coverArt } = route.params as RouteParams;
  const { isShuffle } = usePlayerState();
  const { play, toggleShuffle, purgeAlbum, purgePlaylist, purgeGenre, addToPlaylist } = usePlayerActions();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionCover, setCollectionCover] = useState<string | undefined>(undefined);
  const [subtitle, setSubtitle] = useState<string>('');
  const [lastUpdatedText, setLastUpdatedText] = useState<string | null>(null);

  // Search state for Add to Playlist
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [isRemovalMode, setIsRemovalMode] = useState(false);
  // IDs of tracks already in this playlist + tracks just added this session
  const [playlistTrackIds, setPlaylistTrackIds] = useState<Set<string>>(new Set());
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const [starring, setStarring] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [heroAccentColor, setHeroAccentColor] = useState(colors.primary);
  const [heroBackdropStart, setHeroBackdropStart] = useState('rgba(0, 0, 0, 0)');
  const [heroBackdropEnd, setHeroBackdropEnd] = useState(colors.background);

  const handleStarAlbum = async () => {
    if (starring || type !== 'album') return;
    setStarring(true);
    try {
      if (isStarred) {
        await unstar(id);
        setIsStarred(false);
      } else {
        await star(id);
        setIsStarred(true);
      }
    } catch (e) {
      console.error('Star failed', e);
    } finally {
      setStarring(false);
    }
  };

  useEffect(() => {
    // Clear previous data immediately when navigating to a new collection
    setTracks([]);
    setCollectionCover(undefined);
    setSubtitle('');
    setLastUpdatedText(null);
    setShowSearch(false);
    setIsRemovalMode(false);
    loadData();
  }, [type, id]);

  useEffect(() => {
    if (!collectionCover) {
      setHeroAccentColor(colors.primary);
      setHeroBackdropStart('rgba(0, 0, 0, 0)');
      setHeroBackdropEnd(colors.background);
      return;
    }

    let cancelled = false;
    getColors(collectionCover, {
      fallback: colors.primary,
      cache: true,
      key: collectionCover,
      quality: 'low',
      pixelSpacing: 6,
    })
      .then((result) => {
        if (cancelled) return;
        const { dominant, vibrant } = getPaletteKeys(result, colors.primary);
        const tint = mixHex(dominant, colors.background, 0.72);
        const accent = ensureContrast(vibrant, colors.background, 3.0, colors.primary);
        setHeroAccentColor(accent);
        setHeroBackdropStart(toRgba(tint, 0.34));
        setHeroBackdropEnd(colors.background);
      })
      .catch(() => {
        if (cancelled) return;
        setHeroAccentColor(colors.primary);
        setHeroBackdropStart('rgba(0, 0, 0, 0)');
        setHeroBackdropEnd(colors.background);
      });

    return () => {
      cancelled = true;
    };
  }, [collectionCover, colors.background, colors.primary]);

  const loadData = async () => {
    setLoading(true);
    let url: string | undefined = undefined;

    if (coverArt) {
       if (coverArt.startsWith('http')) {
           url = coverArt;
       } else {
           try {
              url = await getCoverArtUrl(coverArt, 600);
           } catch (e) {
              console.warn('Failed to resolve param cover art', e);
           }
       }
    }
    
    if (url) setCollectionCover(url);

    try {
      let fetchedTracks: Track[] = [];
      
      if (type === 'album') {
        const data = await getAlbum(id);
        fetchedTracks = data.tracks || [];
        const totalDuration = data.album.duration || calculateTotalDuration(fetchedTracks);
        const yearStr = data.album.year ? ` • ${data.album.year}` : data.album.created ? ` • ${new Date(data.album.created).getFullYear()}` : '';
        setSubtitle(`${data.album.artist || ''} • ${fetchedTracks.length} songs • ${formatTotalDuration(totalDuration)}${yearStr}`);
        setLastUpdatedText(null);
        if (!url && data.album.coverArt) {
           url = await getCoverArtUrl(data.album.coverArt, 600);
        }
      } else if (type === 'playlist') {
        const data = await getPlaylist(id);
        fetchedTracks = data.entry || [];
        const totalDuration = data.duration || calculateTotalDuration(fetchedTracks);
        setSubtitle(`${fetchedTracks.length} songs • ${formatTotalDuration(totalDuration)}`);
        const stamp = data.changed || data.created;
        setLastUpdatedText(stamp ? `Last updated ${new Date(stamp).toLocaleDateString()}` : null);
        if (!url) {
          try {
            const artUrls = await getPlaylistArtUrls(data, 1);
            if (artUrls.length > 0) {
              url = artUrls[0];
            }
          } catch (error) {
            console.warn('Failed to resolve playlist art for header', error);
          }
        }
        if (!url && fetchedTracks.length > 0) {
          const albumId = fetchedTracks.find((t) => t.albumId)?.albumId;
          if (albumId) {
            try {
              const albumData = await getAlbum(albumId);
              if (albumData.album?.coverArt) {
                url = await getCoverArtUrl(albumData.album.coverArt, 600);
              }
            } catch (error) {
              console.warn('Failed to resolve playlist album cover', error);
            }
          }
        }
      } else if (type === 'genre') {
        fetchedTracks = await getSongsByGenre(id); 
        const totalDuration = calculateTotalDuration(fetchedTracks);
        setSubtitle(`${fetchedTracks.length} songs • ${formatTotalDuration(totalDuration)}`);
        setLastUpdatedText(null);
      }

      setTracks(fetchedTracks);
      setPlaylistTrackIds(new Set(fetchedTracks.map((t) => t.id)));

      if (!url && fetchedTracks.length > 0) {
        // Fallback: first track with coverArt, else a non-temp recording id.
        let bestId = fetchedTracks.find((t) => t.coverArt && !t.coverArt.startsWith('temp-'))?.coverArt
          || fetchedTracks.find((t) => t.coverArt)?.coverArt
          || fetchedTracks.find((t) => t.id && !t.id.startsWith('temp-'))?.id
          || fetchedTracks[0]?.id;

        const coverId = bestId || fetchedTracks[0]?.id;
        if (coverId) {
          url = await getCoverArtUrl(coverId, 600);
        }
      }

      if (url) setCollectionCover(url);

    } catch (error) {
      console.error('Failed to load collection details', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handlePurge = () => {
    let warning = '';
    if (type === 'album' || type === 'genre') {
      warning = `This will COMPLETELY delete ALL associated tracks from the server and file system. This is non-reversible.`;
    } else {
      warning = `This will remove the playlist. The original music files will NOT be deleted.`;
    }

    Alert.alert(
      `Purge ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      warning,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'PURGE', 
          style: 'destructive',
          onPress: async () => {
            try {
              if (type === 'album') await purgeAlbum(id, tracks);
              else if (type === 'playlist') await purgePlaylist(id, tracks);
              else if (type === 'genre') await purgeGenre(id, tracks);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to purge. Please try again.');
            }
          }
        },
      ]
    );
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  // Debounce timer for add-to-playlist search
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (query.trim().length < 5) {
      setSearchResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await search3(query.trim());
        setSearchResults(results.tracks);
      } catch (e) {
        console.error('Search failed', e);
      } finally {
        setSearching(false);
      }
    }, 2000);
  };

  const handleAddTrack = async (track: Track) => {
    if (addingTrackId || playlistTrackIds.has(track.id)) return;
    setAddingTrackId(track.id);
    try {
      await addToPlaylist(track.id, id);
      // Optimistically mark as added so the row shows the checkmark immediately
      setPlaylistTrackIds((prev) => new Set([...prev, track.id]));
      setAddingTrackId(null);
      // Brief delay so the user sees the ✓ before results clear
      setTimeout(() => {
        setSearchQuery('');
        setSearchResults([]);
        setShowSearch(false);
        loadData();
      }, 700);
    } catch (e) {
      setAddingTrackId(null);
      Alert.alert('Error', 'Failed to add track to playlist');
    }
  };

  const handleTrackPress = (track: Track, index: number) => {
    if (isRemovalMode) {
      handleRemoveTrack(index);
    } else {
      play(track, tracks, true, { kind: type, id, label: name });
    }
  };

  const handleRemoveTrack = async (index: number) => {
    if (type !== 'playlist') return;
    try {
      const track = tracks[index];
      await updatePlaylist(id, undefined, undefined, index);
      // Optimistic update
      setTracks(prev => prev.filter((_, i) => i !== index));
    } catch (e) {
      Alert.alert('Error', 'Failed to remove track from playlist');
    }
  };

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      if (isShuffle) toggleShuffle();
      play(tracks[0], tracks, true, { kind: type, id, label: name });
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      if (!isShuffle) toggleShuffle();
      play(tracks[Math.floor(Math.random() * tracks.length)], tracks, true, { kind: type, id, label: name });
    }
  };

  if (loading && tracks.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading {name}...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {type === 'playlist' && (
            <>
              <TouchableOpacity
                onPress={() => setShowSearch(!showSearch)}
                style={styles.headerActionButton}
                accessibilityRole="button"
                accessibilityLabel={showSearch ? 'Close add songs' : 'Add songs'}
                accessibilityState={{ selected: showSearch }}
              >
                <Ionicons name={showSearch ? "close" : "add"} size={24} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsRemovalMode(!isRemovalMode)}
                style={styles.headerActionButton}
                accessibilityRole="button"
                accessibilityLabel={isRemovalMode ? 'Finish remove mode' : 'Enable remove mode'}
                accessibilityState={{ selected: isRemovalMode }}
              >
                <Ionicons name={isRemovalMode ? "checkmark" : "remove"} size={24} color={isRemovalMode ? colors.primary : colors.text} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            onPress={handlePurge}
            style={styles.headerActionButton}
            accessibilityRole="button"
            accessibilityLabel={`Delete this ${type}`}
          >
            <Ionicons name="trash" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {showSearch && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for songs to add..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} style={{ margin: 10 }} />}
          {searchResults.length > 0 && (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => `search-${item.id}`}
              style={styles.searchResultsList}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              renderItem={({ item }) => {
                const alreadyAdded = playlistTrackIds.has(item.id);
                const isAdding = addingTrackId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.searchResultItem, alreadyAdded && styles.searchResultItemAdded]}
                    onPress={() => handleAddTrack(item)}
                    disabled={alreadyAdded || !!addingTrackId}
                  >
                    <Ionicons
                      name={alreadyAdded ? 'checkmark-circle' : isAdding ? 'sync-outline' : 'add-circle-outline'}
                      size={20}
                      color={alreadyAdded ? colors.primary : isAdding ? colors.textMuted : colors.primary}
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.searchResultTitle, alreadyAdded && { color: colors.textMuted }]} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.searchResultArtist} numberOfLines={1}>{item.artist}</Text>
                    </View>
                    {alreadyAdded && (
                      <Text style={styles.addedLabel}>Added</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      <FlatList
        data={tracks}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        ListHeaderComponent={
          <View style={styles.heroSection}>
            {collectionCover ? (
              <Image
                source={{ uri: collectionCover }}
                style={styles.heroBackdropImage}
                blurRadius={22}
                fadeDuration={0}
                progressiveRenderingEnabled
              />
            ) : null}
            <LinearGradient
              pointerEvents="none"
              colors={[heroBackdropStart, heroBackdropEnd]}
              locations={[0, 1]}
              style={styles.heroBackdrop}
            />
            <View style={styles.coverWrapper}>
              {collectionCover ? (
                <Image source={{ uri: collectionCover }} style={styles.coverImage} />
              ) : (
                <View style={[styles.coverImage, styles.placeholderCover]}>
                  <Ionicons name={type === 'album' ? "disc" : "musical-notes"} size={64} color={colors.textMuted} />
                </View>
              )}
            </View>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {type === 'playlist' && lastUpdatedText ? (
              <Text style={styles.lastUpdated}>{lastUpdatedText}</Text>
            ) : null}
            
            <View style={styles.heroActions}>
              <TouchableOpacity
                onPress={handlePlayAll}
                style={[styles.playButton, { backgroundColor: heroAccentColor }]}
                accessibilityRole="button"
                accessibilityLabel="Play collection"
              >
                <Ionicons name="play" size={24} color="#FFF" />
                <Text style={styles.playButtonText}>Play</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShufflePlay}
                style={[styles.shuffleButton, { borderColor: toRgba(heroAccentColor, 0.25) }]}
                accessibilityRole="button"
                accessibilityLabel="Shuffle play collection"
              >
                <Ionicons name="shuffle" size={24} color={heroAccentColor} />
              </TouchableOpacity>
              {type === 'album' && (
                <TouchableOpacity
                  onPress={handleStarAlbum}
                  style={[styles.shuffleButton, { borderColor: toRgba(heroAccentColor, 0.25) }]}
                  disabled={starring}
                  accessibilityRole="button"
                  accessibilityLabel={isStarred ? 'Remove album from favorites' : 'Add album to favorites'}
                  accessibilityState={{ selected: isStarred, busy: starring }}
                >
                  <Ionicons
                    name={isStarred ? 'heart' : 'heart-outline'}
                    size={24}
                    color={isStarred ? colors.primary : colors.text}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackItem
            track={item}
            onPress={() => handleTrackPress(item, index)}
            showNumber={type === 'album'}
            isRemovalMode={isRemovalMode}
            onRemove={() => handleRemoveTrack(index)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      />
      
    </View>
  );
}

const createStyles = (colors: { background: string; border: string; surfaceLight: string; text: string; textMuted: string; primary: string; textSecondary: string; surface: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 10,
    },
    headerButton: {
      padding: SPACING.xs,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerActionButton: {
      padding: SPACING.xs,
      marginLeft: SPACING.sm,
    },
    searchContainer: {
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.sm,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      maxHeight: 300,
    },
    searchInput: {
      height: 44,
      backgroundColor: colors.surfaceLight,
      borderRadius: 8,
      paddingHorizontal: SPACING.md,
      color: colors.text,
      fontSize: FONT_SIZES.md,
    },
    searchResultsList: {
      marginTop: SPACING.xs,
    },
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    searchResultItemAdded: {
      opacity: 0.55,
    },
    addedLabel: {
      fontSize: FONT_SIZES.xs,
      color: colors.primary,
      fontWeight: '600',
      marginLeft: SPACING.xs,
    },
    searchResultTitle: {
      color: colors.text,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
    },
    searchResultArtist: {
      color: colors.textMuted,
      fontSize: FONT_SIZES.sm,
    },
    heroSection: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.md,
      position: 'relative',
      overflow: 'hidden',
    },
    heroBackdrop: {
      ...StyleSheet.absoluteFill,
    },
    heroBackdropImage: {
      ...StyleSheet.absoluteFill,
      opacity: 0.26,
      transform: [{ scale: 1.04 }],
    },
    coverWrapper: {
      width: 200,
      height: 200,
      borderRadius: 8,
      elevation: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      marginBottom: SPACING.md,
    },
    coverImage: {
      width: '100%',
      height: '100%',
      borderRadius: 8,
    },
    placeholderCover: {
      backgroundColor: colors.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: FONT_SIZES.xl,
      fontWeight: 'bold',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: FONT_SIZES.md,
      color: colors.textSecondary,
      marginBottom: SPACING.lg,
    },
    lastUpdated: {
      fontSize: FONT_SIZES.sm,
      color: colors.textMuted,
      marginTop: -SPACING.md,
      marginBottom: SPACING.md,
      letterSpacing: 0.2,
    },
    heroActions: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    playButton: {
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.sm,
      borderRadius: 30,
    },
    playButtonText: {
      color: '#FFF',
      fontWeight: 'bold',
      marginLeft: 8,
      fontSize: FONT_SIZES.md,
    },
    shuffleButton: {
      backgroundColor: colors.surface,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: 30,
      marginLeft: SPACING.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContent: {
      paddingBottom: 100,
    },
    loadingText: {
      marginTop: SPACING.md,
      fontSize: FONT_SIZES.md,
      color: colors.textSecondary,
    },
  });

function getPaletteKeys(result: ImageColorsResult, fallback: string) {
  if (result.platform === 'ios') {
    return {
      dominant: result.background || fallback,
      vibrant: result.primary || fallback,
    };
  }
  return {
    dominant: result.dominant || fallback,
    vibrant: result.vibrant || result.lightVibrant || fallback,
  };
}

function mixHex(hexA: string, hexB: string, ratio: number) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const t = clamp01(ratio);
  const r = Math.round(a.r * (1 - t) + b.r * t);
  const g = Math.round(a.g * (1 - t) + b.g * t);
  const bl = Math.round(a.b * (1 - t) + b.b * t);
  return rgbToHex(r, g, bl);
}

function ensureContrast(candidate: string, background: string, minContrast: number, fallback: string) {
  return contrastRatio(candidate, background) >= minContrast ? candidate : fallback;
}

function contrastRatio(foreground: string, background: string) {
  const f = parseHex(foreground);
  const b = parseHex(background);
  const l1 = relativeLuminance(f.r, f.g, f.b);
  const l2 = relativeLuminance(b.r, b.g, b.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(r: number, g: number, b: number) {
  const toLinear = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function toRgba(hex: string, alpha: number) {
  const parsed = parseHex(hex);
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clamp01(alpha)})`;
}

function parseHex(input: string) {
  const hex = normalizeHex(input);
  if (!hex) return { r: 0, g: 0, b: 0 };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function normalizeHex(input: string) {
  if (!input) return null;
  const value = input.trim();
  const shortMatch = value.match(/^#([0-9a-fA-F]{3})$/);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const fullMatch = value.match(/^#([0-9a-fA-F]{6})$/);
  return fullMatch ? `#${fullMatch[1]}` : null;
}

function rgbToHex(r: number, g: number, b: number) {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const toHex = (value: number) => clamp(value).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
