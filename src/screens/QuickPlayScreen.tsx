import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Dimensions, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getColors, type ImageColorsResult } from 'react-native-image-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { usePlayer } from '../context/PlayerContext';
import { AlbumCardWithCover, AlbumHorizontalList, SectionHeader, TrackHorizontalList } from '../components';
import { DiskArtwork } from '../components/DiskArtwork';
import { getRandomSongs, getRecentSongs, getTopSongs, getCoverArtUrl, getStreamUrl, search3, getAlbumList } from '../services/subsonic';
import { getDriftRadioRecommendation, getRecommendations } from '../services/recommendations';
import { Album, Track } from '../types';
import { isExternalTrackId } from '../context/playerQueueUtils';

const { width } = Dimensions.get('window');
const HOME_DRIFT_RADIO_LIMIT = 9;
const HOME_DRIFT_RADIO_COLUMNS = 3;
const HOME_COMPACT_CARD_WIDTH = 156;
const HOME_RADIO_CARD_WIDTH = (width - SPACING.md * 2 - SPACING.sm * (HOME_DRIFT_RADIO_COLUMNS - 1)) / HOME_DRIFT_RADIO_COLUMNS;
const DEFAULT_HERO_SURFACE_LIGHT = '#FAFAFB';
const DEFAULT_HERO_SURFACE_DARK = 'rgba(255, 255, 255, 0.04)';

export function QuickPlayScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const activeIconColor = isDark ? '#5DD26F' : '#1FA34A';
  const {
    currentTrack,
    queue,
    queueSource,
    isPlaying,
    isLoading,
    autoQueueEnabled,
    recentlyPlayedTrackIds,
    play,
    pause,
    resume,
    load,
    addToQueue,
    setUpcomingQueueFromCurrent,
    setAutoQueueEnabled,
  } = usePlayer();

  const [recentSongs, setRecentSongs] = React.useState<Track[]>([]);
  const [topSongs, setTopSongs] = React.useState<Track[]>([]);
  const [radioSongs, setRadioSongs] = React.useState<Track[]>([]);
  const [recentlyAddedAlbums, setRecentlyAddedAlbums] = React.useState<Album[]>([]);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);
  const [artFailed, setArtFailed] = React.useState(false);
  const [heroAccentColor, setHeroAccentColor] = React.useState(colors.primary);
  const [heroLabelColor, setHeroLabelColor] = React.useState(colors.primary);
  const [heroTintStartColor, setHeroTintStartColor] = React.useState('rgba(0, 0, 0, 0)');
  const autoQueueFetchToken = React.useRef(0);
  const [isFreePlayLoading, setIsFreePlayLoading] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const isLoadingNextRef = React.useRef(false);
  const isDriftRadioFeedTrack = React.useCallback((track: Track | null | undefined) => {
    return !!track?.id && track.id.startsWith('news-');
  }, []);
  const heroTrack = currentTrack || recentSongs[0] || topSongs[0] || null;

  const queryClient = useQueryClient();

  const recentSongsQuery = useQuery({
    queryKey: ['home', 'recentSongs'],
    queryFn: () => getRecentSongs(40),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const topSongsQuery = useQuery({
    queryKey: ['home', 'topSongs'],
    queryFn: () => getTopSongs(40),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const driftRadioQuery = useQuery({
    queryKey: ['home', 'driftRadio'],
    queryFn: () => getDriftRadioRecommendation(),
    staleTime: 1000 * 60 * 30, // 30 min caching for home data
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const recentlyAddedAlbumsQuery = useQuery({
    queryKey: ['home', 'recentlyAddedAlbums'],
    queryFn: () => getAlbumList('newest', 12, 0),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  React.useEffect(() => {
    const recent = recentSongsQuery.data || [];
    const topPlayed = topSongsQuery.data || [];
    const radio = driftRadioQuery.data || [];
    const newestAlbums = recentlyAddedAlbumsQuery.data || [];

    setRecentSongs(recent);
    setTopSongs(topPlayed.filter((track) => !isDriftRadioFeedTrack(track)));
    setRadioSongs(radio.filter((track) => isDriftRadioFeedTrack(track)));
    setRecentlyAddedAlbums(newestAlbums);
  }, [
    recentSongsQuery.data,
    topSongsQuery.data,
    driftRadioQuery.data,
    recentlyAddedAlbumsQuery.data,
    isDriftRadioFeedTrack,
  ]);

  React.useEffect(() => {
    const coverId = heroTrack?.coverArt || heroTrack?.albumId || heroTrack?.id;
    
    if (coverId) {
      setArtFailed(false);
      getCoverArtUrl(coverId, 600).then(setCoverUrl).catch(() => setCoverUrl(null));
    } else {
      setCoverUrl(null);
    }
  }, [heroTrack?.id, heroTrack?.coverArt, heroTrack?.albumId]);

  React.useEffect(() => {
    if (!coverUrl) {
      setHeroAccentColor(colors.primary);
      setHeroLabelColor(colors.primary);
      setHeroTintStartColor('rgba(0, 0, 0, 0)');
      return;
    }

    let cancelled = false;
    getColors(coverUrl, {
      fallback: colors.primary,
      cache: true,
      key: coverUrl,
      quality: 'low',
      pixelSpacing: 6,
    })
      .then((result) => {
        if (cancelled) return;

        const { dominant, vibrant, muted } = getPaletteKeys(result, colors.primary);
        const tintHex = mixHex(dominant, colors.background, isDark ? 0.66 : 0.86);
        const surface = mixHex(muted, colors.background, isDark ? 0.78 : 0.92);
        const accent = ensureContrast(vibrant, surface, 2.8, colors.primary);
        const label = ensureContrast(vibrant, surface, 2.2, colors.primary);

        setHeroTintStartColor(isDark ? toRgba(tintHex, 0.42) : 'rgba(0, 0, 0, 0)');
        setHeroAccentColor(accent);
        setHeroLabelColor(label);
      })
      .catch(() => {
        if (cancelled) return;
        setHeroAccentColor(colors.primary);
        setHeroLabelColor(colors.primary);
        setHeroTintStartColor('rgba(0, 0, 0, 0)');
      });

    return () => {
      cancelled = true;
    };
  }, [coverUrl, colors.background, colors.primary, isDark]);

  React.useEffect(() => {
    checkQueueAndLoadMore();
  }, [queue, currentTrack, autoQueueEnabled]);

  const warmTrackDownload = async (trackId: string) => {
    try {
      const streamUrl = await getStreamUrl(trackId);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      await fetch(streamUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: controller.signal,
      }).catch(() => undefined);

      clearTimeout(timeout);
    } catch {
      // Best-effort warm request; playback path still works.
    }
  };

  const checkQueueAndLoadMore = async () => {
    if (!currentTrack || !autoQueueEnabled) return;
    if (isLoadingNextRef.current) return;

    const currentIndex = queue.findIndex((item) => item.id === currentTrack.id);
    if (currentIndex === -1) return;

    const upcomingTracks = queue.length - 1 - currentIndex;
    const tracksNeeded = 2 - upcomingTracks;
    if (tracksNeeded <= 0) return;

    isLoadingNextRef.current = true;
    const token = ++autoQueueFetchToken.current;
    try {
      const excludeIds = new Set<string>([
        ...recentlyPlayedTrackIds,
        currentTrack.id,
        ...queue.map((t) => t.id),
      ]);
      const suggestions = await getRecommendations();
      const pool = suggestions?.length ? suggestions : await getRandomSongs(20);

      // Bail if autoQueue was toggled off while we were fetching, or a newer fetch started
      if (token !== autoQueueFetchToken.current) return;
      if (!autoQueueEnabled) return;

      const newTracks = pool.filter((t) => !excludeIds.has(t.id)).slice(0, tracksNeeded);
      newTracks.forEach((track) => {
        addToQueue(track);
        warmTrackDownload(track.id);
      });
    } catch (error) {
      console.error('Failed to auto-load next songs', error);
    } finally {
      if (token === autoQueueFetchToken.current) {
        isLoadingNextRef.current = false;
      }
    }
  };

  const onRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['home', 'recentSongs'] }),
      queryClient.invalidateQueries({ queryKey: ['home', 'topSongs'] }),
      queryClient.invalidateQueries({ queryKey: ['home', 'driftRadio'] }),
      queryClient.invalidateQueries({ queryKey: ['home', 'recentlyAddedAlbums'] }),
    ]);
    await Promise.all([
      recentSongsQuery.refetch(),
      topSongsQuery.refetch(),
      driftRadioQuery.refetch(),
      recentlyAddedAlbumsQuery.refetch(),
    ]);
    setIsRefreshing(false);
  }, [queryClient, recentSongsQuery, topSongsQuery, driftRadioQuery, recentlyAddedAlbumsQuery]);

  const resolvePlayableTrack = React.useCallback(async () => {
    if (!currentTrack) return null;
    const id = currentTrack.id || '';
    const needsResolution =
      !id ||
      id.startsWith('temp-') ||
      id.startsWith('lfm:') ||
      id.startsWith('spotify:');

    if (!needsResolution) {
      return currentTrack;
    }

    try {
      const query = `${currentTrack.title || ''} ${currentTrack.artist || ''}`.trim();
      if (query.length < 2) return currentTrack;
      const result = await search3(query);
      return result.tracks[0] || currentTrack;
    } catch {
      return currentTrack;
    }
  }, [currentTrack]);

  const isResolvableExternalId = React.useCallback((id: string) => isExternalTrackId(id), []);

  const buildPlayableQueue = React.useCallback((selected: Track, sourceQueue: Track[]) => {
    const base = (sourceQueue || []).filter((t) => !!t?.id && !t.isDir && !isResolvableExternalId(t.id));
    const selectedAlreadyPlayable = !!selected?.id && !selected.isDir && !isResolvableExternalId(selected.id);
    const selectedTrack = selectedAlreadyPlayable ? selected : null;

    const unique = new Map<string, Track>();
    if (selectedTrack) {
      unique.set(selectedTrack.id, selectedTrack);
    }
    base.forEach((track) => {
      if (!unique.has(track.id)) {
        unique.set(track.id, track);
      }
    });

    return Array.from(unique.values());
  }, [isResolvableExternalId]);

  const resolveTrackBySearch = React.useCallback(async (track: Track) => {
    if (!track?.id || !isResolvableExternalId(track.id)) return track;
    try {
      const query = `${track.title || ''} ${track.artist || ''}`.trim();
      if (query.length < 2) return null;
      const result = await search3(query);
      return result.tracks.find((t) => !t.isDir && !isResolvableExternalId(t.id)) || null;
    } catch {
      return null;
    }
  }, [isResolvableExternalId]);

  const handlePlayPause = async () => {
    if (isPlaying) {
      pause();
    } else if (heroTrack) {
      // Always use play() — it loads the track into RNTP and starts playback.
      // resume() only works if RNTP already has something queued; after an app
      // restart the queue is empty even though currentTrack is displayed.
      const fallbackQueue =
        queue.length > 0
          ? queue
          : recentSongs.some((t) => t.id === heroTrack.id)
            ? recentSongs
            : topSongs.some((t) => t.id === heroTrack.id)
              ? topSongs
              : [heroTrack];
      const fallbackSource =
        queueSource ||
        (recentSongs.some((t) => t.id === heroTrack.id)
          ? { kind: 'recent', label: 'Recent Songs' as const }
          : topSongs.some((t) => t.id === heroTrack.id)
            ? { kind: 'top', label: 'Top Songs' as const }
            : { kind: 'manual', label: 'Now Playing' as const });
      play(heroTrack, fallbackQueue, true, fallbackSource);
    }
  };

  const handleFreePlayReset = async () => {
    if (isFreePlayLoading) return;
    if (autoQueueEnabled) {
      // Invalidate any in-flight auto-queue fetch so it discards its result
      autoQueueFetchToken.current++;
      isLoadingNextRef.current = false;
      setAutoQueueEnabled(false);
      return;
    }
    setIsFreePlayLoading(true);
    try {
      const excludeIds = new Set<string>(recentlyPlayedTrackIds);
      if (currentTrack?.id) excludeIds.add(currentTrack.id);

      const recommendations = await getRecommendations();
      const pool = recommendations?.length > 0 ? recommendations : await getRandomSongs(50);
      const filtered = pool.filter((t) => !excludeIds.has(t.id));

      if (filtered.length === 0) return;

      if (currentTrack) {
        // Queue 2 tracks ahead of the current one and enable auto-queue
        const ahead = filtered.slice(0, 2);
        setUpcomingQueueFromCurrent(ahead, true);
        ahead.forEach((t) => warmTrackDownload(t.id));
      } else {
        // No current track — boot from scratch
        const bootQueue = filtered.slice(0, 3);
        await load(bootQueue[0], bootQueue, { kind: 'radio', label: 'Free Play Queue' });
        setAutoQueueEnabled(true);
        bootQueue.slice(1).forEach((t) => warmTrackDownload(t.id));
        await resume();
      }
    } catch (error) {
      console.error('Failed to start free play', error);
    } finally {
      setIsFreePlayLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={[styles.heroSection, { paddingTop: SPACING.md }]}>
          <LinearGradient
            pointerEvents="none"
            colors={[heroTintStartColor, colors.background]}
            locations={[0, 1]}
            style={styles.heroBackdrop}
          />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>DRIFT</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={handleFreePlayReset}
                style={[styles.headerIconButton, autoQueueEnabled && styles.headerIconButtonActive]}
                accessibilityRole="button"
                accessibilityLabel={autoQueueEnabled ? 'Disable free play auto queue' : 'Enable free play auto queue'}
                accessibilityState={{ selected: autoQueueEnabled, busy: isFreePlayLoading }}
              >
                <Ionicons
                  name={isFreePlayLoading ? 'sync-outline' : 'radio-outline'}
                  size={20}
                  color={autoQueueEnabled ? activeIconColor : colors.text}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('Search')}
                style={styles.headerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Open search"
              >
                <Ionicons name="search-outline" size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('NowPlaying')}
                style={styles.headerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Open now playing"
              >
                <Ionicons name="chevron-up-outline" size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('Settings')}
                style={styles.headerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                <Ionicons name="person-circle-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.artContainer}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('NowPlaying')}
            accessibilityRole="button"
            accessibilityLabel="Open now playing artwork"
          >
            {coverUrl && !artFailed ? (
              <Image
                key={coverUrl}
                source={{ uri: coverUrl }}
                style={styles.artImage}
                resizeMode="cover"
                onError={() => setArtFailed(true)}
              />
            ) : (
              <View style={[styles.artImage, styles.artPlaceholder]}>
                <DiskArtwork size={Math.min(width * 0.55, 220)} isSpinning={isPlaying} isLoading={isLoading} />
              </View>
            )}
          </TouchableOpacity>

          {heroTrack ? (
            <View style={styles.heroCard}>
              <TouchableOpacity
                style={styles.heroInfoTap}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('NowPlaying')}
                accessibilityRole="button"
                accessibilityLabel={`Open now playing for ${heroTrack.title}`}
              >
                <View style={styles.heroInfo}>
                  <Text style={[styles.heroLabel, { color: heroLabelColor }]}>JUMP BACK IN</Text>
                  <Text style={styles.trackTitle} numberOfLines={1}>{heroTrack.title}</Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>{heroTrack.artist}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.heroPlayBtn, { backgroundColor: heroAccentColor }]}
                onPress={handlePlayPause}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause track' : `Play ${heroTrack.title}`}
                accessibilityState={{ busy: isLoading }}
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : null}

        </View>

        {recentSongs.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recent Songs" />
            <TrackHorizontalList
              tracks={recentSongs}
              itemWidth={HOME_COMPACT_CARD_WIDTH}
              itemSpacing={SPACING.sm}
              onTrackPress={(track) => {
                play(track, recentSongs, true, { kind: 'recent', label: 'Recent Songs' });
              }}
            />
          </View>
        )}

        {topSongs.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Top Songs" />
            <TrackHorizontalList
              tracks={topSongs.slice(0, 10)}
              itemWidth={HOME_COMPACT_CARD_WIDTH}
              itemSpacing={SPACING.sm}
              onTrackPress={(track) => {
                play(track, topSongs, true, { kind: 'top', label: 'Top Songs' });
              }}
            />
          </View>
        )}

        {recentlyAddedAlbums.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recently Added" />
            <AlbumHorizontalList
              albums={recentlyAddedAlbums}
              itemWidth={HOME_COMPACT_CARD_WIDTH}
              onAlbumPress={(album) => {
                navigation.navigate('CollectionDetails', {
                  type: 'album',
                  id: album.id,
                  name: album.name,
                  coverArt: album.coverArt,
                });
              }}
            />
          </View>
        )}

        {radioSongs.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Drift Radio (RSS)" />
            <View style={styles.radioGrid}>
              {radioSongs.slice(0, HOME_DRIFT_RADIO_LIMIT).map((track, index) => (
                <View
                  key={`${track.id}-${index}`}
                  style={[
                    styles.radioGridItem,
                    {
                      width: HOME_RADIO_CARD_WIDTH,
                      marginRight: index % HOME_DRIFT_RADIO_COLUMNS === HOME_DRIFT_RADIO_COLUMNS - 1 ? 0 : SPACING.sm,
                    },
                  ]}
                >
                  <AlbumCardWithCover
                    name={track.title || 'Unknown Track'}
                    artist={track.artist || 'Unknown Artist'}
                    coverArtId={(() => {
                      let coverId = track.coverArt;
                      if ((!coverId || coverId.startsWith('temp-')) && track.albumId && !track.albumId.startsWith('temp-')) {
                        coverId = track.albumId;
                      }
                      return coverId || track.albumId || track.id;
                    })()}
                    onPress={() => {
                      play(track, radioSongs, true, { kind: 'radio', label: 'Drift Radio' });
                    }}
                    style={{ width: '100%' }}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: { 
  background: string; 
  primary: string; 
  surface: string; 
  border: string; 
  text: string; 
  textSecondary: string; 
  textMuted: string;
  glass: string;
  glassBorder: string;
}, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flex: 1,
    },
    scrollContentContainer: {
      paddingBottom: 150,
      paddingTop: 0,
    },
    heroSection: {
      paddingBottom: 16,
      alignItems: 'center',
      backgroundColor: colors.background,
      position: 'relative',
      overflow: 'hidden',
    },
    heroBackdrop: {
      ...StyleSheet.absoluteFill,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '900',
      color: colors.primary,
      letterSpacing: 1.6,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    headerIconButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerIconButtonActive: {
      backgroundColor: isDark ? 'rgba(93, 210, 111, 0.2)' : '#EAF7EE',
      borderColor: isDark ? 'rgba(93, 210, 111, 0.5)' : '#B7E5C6',
    },
    artContainer: {
      width: width - SPACING.lg * 2,
      height: width - SPACING.lg * 2,
      marginBottom: 24,
      borderRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 20,
    },
    artImage: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
    },
    artPlaceholder: {
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: width - SPACING.lg * 2,
      padding: SPACING.lg,
      backgroundColor: isDark ? DEFAULT_HERO_SURFACE_DARK : DEFAULT_HERO_SURFACE_LIGHT,
      borderRadius: 20,
      marginTop: SPACING.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(17, 24, 39, 0.03)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.12 : 0.03,
      shadowRadius: 5,
      elevation: 1,
    },
    heroInfo: {
      flex: 1,
    },
    heroInfoTap: {
      flex: 1,
      marginRight: SPACING.md,
    },
    heroLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 1.5,
      marginBottom: 4,
    },
    trackTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
    },
    trackArtist: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      marginTop: 2,
    },
    heroPlayBtn: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    section: {
      marginTop: SPACING.lg,
      backgroundColor: colors.background,
    },
    radioGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: SPACING.md,
    },
    radioGridItem: {
      marginBottom: SPACING.sm,
    },
  });

function getPaletteKeys(result: ImageColorsResult, fallback: string) {
  if (result.platform === 'ios') {
    return {
      dominant: result.background || fallback,
      vibrant: result.primary || fallback,
      muted: result.secondary || result.detail || fallback,
    };
  }
  return {
    dominant: result.dominant || fallback,
    vibrant: result.vibrant || result.lightVibrant || fallback,
    muted: result.muted || result.darkMuted || fallback,
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
