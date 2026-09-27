import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Alert, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from 'react-native-track-player';
import { LinearGradient } from 'expo-linear-gradient';
import { getColors, type ImageColorsResult } from 'react-native-image-colors';
import { useTheme } from '../context/ThemeContext';
import { usePlayer } from '../context/PlayerContext';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { getCoverArtUrl, getLyrics } from '../services/subsonic';
import { DiskArtwork } from '../components/DiskArtwork';
import { LyricsView } from '../components/LyricsView';

const formatTime = (millis: number) => {
  if (!millis || Number.isNaN(millis)) return '0:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

export function NowPlayingScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    currentTrack,
    queue,
    queueSource,
    isPlaying,
    isLoading,
    isShuffle,
    pause,
    resume,
    next,
    previous,
    seek,
    toggleShuffle,
    toggleHeart,
    isHearted,
    purgeTrack,
  } = usePlayer();
  const progress = useProgress(150);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const stableDurationRef = useRef(0);
  const activeTrackIdRef = useRef<string | null>(null);
  const isScrubbingRef = useRef(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<{ value: string; synced_lrc?: string } | null>(null);
  const [lyricsAvailable, setLyricsAvailable] = useState(false);
  const seekBarWidthRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const pendingSeekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [palettePrimary, setPalettePrimary] = useState(colors.primary);
  const [paletteSecondary, setPaletteSecondary] = useState(colors.textSecondary);
  const [paletteSurface, setPaletteSurface] = useState(colors.surface);
  const [playGlyphColor, setPlayGlyphColor] = useState('#FFFFFF');

  useEffect(() => {
    const coverId = currentTrack?.coverArt || currentTrack?.albumId || currentTrack?.id;
    if (!coverId) {
      setCoverUrl(null);
      return;
    }
    getCoverArtUrl(coverId, 700).then(setCoverUrl).catch(() => setCoverUrl(null));

    setLyrics(null);
    setShowLyrics(false);
    setLyricsAvailable(false);

    if (!currentTrack?.id) return;
    let cancelled = false;
    getLyrics(currentTrack.id)
      .then((res) => {
        if (cancelled) return;
        const hasPlain = !!res?.value?.trim();
        const hasSynced = !!res?.synced_lrc?.trim();
        if (hasPlain || hasSynced) {
          setLyrics(res);
          setLyricsAvailable(true);
        } else {
          setLyrics(null);
          setLyricsAvailable(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Failed to load lyrics', err);
        setLyrics(null);
        setLyricsAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  useEffect(() => {
    if (!coverUrl) {
      setPalettePrimary(colors.primary);
      setPaletteSecondary(colors.textSecondary);
      setPaletteSurface(colors.surface);
      setPlayGlyphColor('#FFFFFF');
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
        const palette = getNowPlayingPalette(result, colors.primary);
        const surface = mixHex(palette.detail, colors.background, 0.9);
        const primary = ensureContrast(palette.vibrant, surface, 3.0, colors.primary);
        const secondary = ensureContrast(palette.muted, surface, 4.5, colors.textSecondary);

        setPalettePrimary(primary);
        setPaletteSecondary(secondary);
        setPaletteSurface(surface);
        setPlayGlyphColor(getReadableTextColor(primary));
      })
      .catch(() => {
        if (cancelled) return;
        setPalettePrimary(colors.primary);
        setPaletteSecondary(colors.textSecondary);
        setPaletteSurface(colors.surface);
        setPlayGlyphColor('#FFFFFF');
      });

    return () => {
      cancelled = true;
    };
  }, [coverUrl, colors.background, colors.primary, colors.surface, colors.textSecondary]);

  useEffect(() => {
    const trackId = currentTrack?.id || null;
    if (trackId !== activeTrackIdRef.current) {
      activeTrackIdRef.current = trackId;
      stableDurationRef.current = currentTrack?.duration ? currentTrack.duration * 1000 : 0;
      isScrubbingRef.current = false;
      pendingSeekRef.current = null;
      if (pendingSeekTimeoutRef.current) {
        clearTimeout(pendingSeekTimeoutRef.current);
        pendingSeekTimeoutRef.current = null;
      }
      setIsScrubbing(false);
      setSliderValue(0);
      return;
    }

    const liveDuration = progress.duration > 0 ? progress.duration * 1000 : 0;
    if (liveDuration > 0) {
      stableDurationRef.current = liveDuration;
    } else if (stableDurationRef.current <= 0 && currentTrack?.duration) {
      stableDurationRef.current = currentTrack.duration * 1000;
    }
  }, [currentTrack?.id, currentTrack?.duration, progress.duration]);

  const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
  const canSkipPrevious = currentIndex > 0;
  const canSkipNext = currentIndex >= 0 && currentIndex < queue.length - 1;
  const sourceLabel = queueSource?.label || 'Current Queue';
  
  const effectiveDuration = Math.max(stableDurationRef.current, 0);
  const sliderMax = Math.max(effectiveDuration, 1);
  const livePosition = progress.position * 1000;
  const clampedLivePosition = Math.max(0, Math.min(livePosition, sliderMax));
  const displayPosition = isScrubbingRef.current
    ? sliderValue
    : pendingSeekRef.current ?? clampedLivePosition;
  const thumbOffset = seekBarWidthRef.current > 0
    ? Math.max(0, Math.min((displayPosition / sliderMax) * seekBarWidthRef.current, seekBarWidthRef.current))
    : 0;

  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
      rotateAnim.setValue(0);
    }
  }, [isLoading]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    if (!isScrubbingRef.current) {
      setSliderValue(clampedLivePosition);
    }
  }, [clampedLivePosition]);

  useEffect(() => {
    const pendingSeek = pendingSeekRef.current;
    if (pendingSeek === null) return;
    if (Math.abs(clampedLivePosition - pendingSeek) <= 1500 || clampedLivePosition >= pendingSeek) {
      pendingSeekRef.current = null;
      if (pendingSeekTimeoutRef.current) {
        clearTimeout(pendingSeekTimeoutRef.current);
        pendingSeekTimeoutRef.current = null;
      }
    }
  }, [clampedLivePosition]);

  const updateScrubFromTouch = (locationX: number) => {
    const width = seekBarWidthRef.current;
    if (width <= 0) return 0;
    const clampedX = Math.max(0, Math.min(locationX, width));
    const nextValue = (clampedX / width) * sliderMax;
    setSliderValue(nextValue);
    return nextValue;
  };

  const handleSeekAccessibilityAction = async (actionName: string) => {
    if (!currentTrack) return;
    const stepMs = 10000;
    const basePosition = isScrubbingRef.current ? sliderValue : displayPosition;
    const nextPosition =
      actionName === 'increment'
        ? Math.min(basePosition + stepMs, sliderMax)
        : Math.max(basePosition - stepMs, 0);
    setSliderValue(nextPosition);
    await finishScrub(nextPosition);
  };

  const finishScrub = async (value: number) => {
    if (!currentTrack) {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      return;
    }
    try {
      await seek(value);
      pendingSeekRef.current = value;
      if (pendingSeekTimeoutRef.current) {
        clearTimeout(pendingSeekTimeoutRef.current);
      }
      pendingSeekTimeoutRef.current = setTimeout(() => {
        pendingSeekRef.current = null;
        pendingSeekTimeoutRef.current = null;
      }, 4000);
    } catch (error) {
      console.error('[NowPlaying] Seek failed', error);
      pendingSeekRef.current = null;
    } finally {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
    }
  };

  const canNavigateToSource =
    queueSource?.kind === 'downloads' ||
    queueSource?.kind === 'recent' ||
    queueSource?.kind === 'top' ||
    (!!queueSource?.id &&
      (queueSource.kind === 'playlist' ||
        queueSource.kind === 'album' ||
        queueSource.kind === 'genre' ||
        queueSource.kind === 'artist'));
  const deleteTone = isDark ? '#FFFFFF' : '#111111';

  const openQueueSource = () => {
    if (!queueSource?.kind) return;
    switch (queueSource.kind) {
      case 'playlist':
      case 'album':
      case 'genre':
        navigation.navigate('CollectionDetails', {
          type: queueSource.kind,
          id: queueSource.id,
          name: queueSource.label,
        });
        break;
      case 'artist':
        navigation.navigate('SeeAll', {
          title: queueSource.label,
          kind: 'tracks',
          items: [],
          artistId: queueSource.id,
        });
        break;
      case 'downloads':
        navigation.navigate('Downloads', { screen: 'DownloadsMain' });
        break;
      case 'recent':
      case 'top':
        navigation.navigate('Home', { screen: 'QuickPlayMain' });
        break;
    }
  };

  return (
    <View style={styles.container}>
      {coverUrl && !showLyrics ? (
        <Image
          source={{ uri: coverUrl }}
          style={styles.screenBackdropImage}
          blurRadius={24}
          fadeDuration={0}
          progressiveRenderingEnabled
        />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={[toRgba(palettePrimary, 0.24), toRgba(paletteSecondary, 0.18), colors.background]}
        locations={[0, 0.5, 1]}
        style={styles.screenBackdropScrim}
      />

      {/* Immersive Header Backdrop */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Close now playing"
          accessibilityHint="Returns to the previous screen"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[
              styles.deleteButton,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.25)',
              },
            ]}
            onPress={() => {
              if (!currentTrack) return;
              Alert.alert(
                'Delete Track',
                `Permanently delete "${currentTrack.title}"? This removes the audio file, metadata, and play history from the server.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { purgeTrack(currentTrack); navigation.goBack(); } },
                ]
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={currentTrack ? `Delete ${currentTrack.title}` : 'Delete current track'}
            accessibilityHint="Removes this track from the server after confirmation"
            accessibilityState={{ disabled: !currentTrack }}
            disabled={!currentTrack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.deleteGlyph}>
              <View style={[styles.deleteLid, { backgroundColor: deleteTone }]} />
              <View style={[styles.deleteBody, { borderColor: deleteTone }]}>
                <View style={[styles.deleteStem, { backgroundColor: deleteTone }]} />
                <View style={[styles.deleteStem, { backgroundColor: deleteTone }]} />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.artWrap}>
        {showLyrics ? (
          <LyricsView 
            lyrics={lyrics?.value || 'No lyrics found for this track.'}
            syncedLrc={lyrics?.synced_lrc}
            onSeek={seek}
          />
        ) : coverUrl ? (
          <Image
            key={coverUrl}
            source={{ uri: coverUrl }}
            style={styles.art}
            fadeDuration={0}
            progressiveRenderingEnabled
            onError={() => setCoverUrl(null)}
          />
        ) : (
          <DiskArtwork size={Dimensions.get('window').width - SPACING.lg * 2} isSpinning={isPlaying} />
        )}
      </View>

      <View style={styles.metaWrap}>
        <Text style={styles.title} numberOfLines={1}>{currentTrack?.title || 'No Track'}</Text>
        <Text style={styles.artist} numberOfLines={1}>{currentTrack?.artist || ''}</Text>
        {canNavigateToSource ? (
          <TouchableOpacity
            onPress={openQueueSource}
            style={[
              styles.sourceChip,
              { backgroundColor: paletteSurface, borderColor: toRgba(paletteSecondary, 0.28) },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${sourceLabel}`}
            accessibilityHint="Navigates to the source this queue came from"
          >
            <Ionicons name="albums-outline" size={14} color={paletteSecondary} />
            <Text style={[styles.sourceText, { color: paletteSecondary }]} numberOfLines={1}>{sourceLabel}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.sourceChip, { backgroundColor: paletteSurface, borderColor: toRgba(paletteSecondary, 0.28) }]}>
            <Ionicons name="albums-outline" size={14} color={paletteSecondary} />
            <Text style={[styles.sourceText, { color: paletteSecondary }]} numberOfLines={1}>{sourceLabel}</Text>
          </View>
        )}
      </View>

      <View style={styles.progressWrap}>
        <View
          style={styles.seekTouchArea}
          onLayout={(event) => {
            seekBarWidthRef.current = event.nativeEvent.layout.width;
          }}
          onStartShouldSetResponder={() => !!currentTrack}
          onMoveShouldSetResponder={() => !!currentTrack}
          onResponderGrant={(event) => {
            if (!currentTrack) return;
            isScrubbingRef.current = true;
            setIsScrubbing(true);
            updateScrubFromTouch(event.nativeEvent.locationX);
          }}
          onResponderMove={(event) => {
            if (!currentTrack || !isScrubbingRef.current) return;
            updateScrubFromTouch(event.nativeEvent.locationX);
          }}
          onResponderRelease={(event) => {
            if (!isScrubbingRef.current) return;
            const nextValue = updateScrubFromTouch(event.nativeEvent.locationX);
            void finishScrub(nextValue);
          }}
          onResponderTerminate={() => {
            void finishScrub(sliderValue);
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Seek position"
          accessibilityHint="Swipe up or down to seek by 10 seconds"
          accessibilityValue={{
            min: 0,
            max: Math.floor(sliderMax / 1000),
            now: Math.floor(displayPosition / 1000),
            text: `${formatTime(displayPosition)} of ${formatTime(effectiveDuration)}`,
          }}
          accessibilityActions={[
            { name: 'increment', label: 'Seek forward 10 seconds' },
            { name: 'decrement', label: 'Seek backward 10 seconds' },
          ]}
          onAccessibilityAction={(event) => {
            void handleSeekAccessibilityAction(event.nativeEvent.actionName);
          }}
        >
          <View style={styles.seekTrack}>
            <View
              style={[
                styles.seekTrackFill,
                {
                  width: `${Math.max(0, Math.min((displayPosition / sliderMax) * 100, 100))}%`,
                  backgroundColor: palettePrimary,
                },
              ]}
            />
            <View
              style={[
                styles.seekThumb,
                {
                  left: Math.max(0, Math.min(thumbOffset - 6, Math.max(seekBarWidthRef.current - 12, 0))),
                  backgroundColor: currentTrack ? palettePrimary : colors.textMuted,
                },
              ]}
            />
          </View>
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(isScrubbing ? sliderValue : displayPosition)}</Text>
          <Text style={styles.timeText}>{formatTime(effectiveDuration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          onPress={toggleShuffle}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={isShuffle ? 'Disable shuffle' : 'Enable shuffle'}
          accessibilityState={{ selected: isShuffle }}
        >
          <Ionicons name="shuffle" size={21} color={isShuffle ? palettePrimary : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={previous}
          disabled={!canSkipPrevious}
          style={[styles.iconBtn, !canSkipPrevious && styles.iconBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Previous track"
          accessibilityState={{ disabled: !canSkipPrevious }}
        >
          <Ionicons name="play-skip-back" size={28} color={canSkipPrevious ? colors.text : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.playBtn,
            {
              backgroundColor: palettePrimary,
              shadowColor: palettePrimary,
              borderColor: toRgba(paletteSecondary, 0.45),
            },
          ]}
          onPress={() => (isPlaying ? pause() : resume())}
          disabled={!currentTrack}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause playback' : 'Play track'}
          accessibilityState={{ disabled: !currentTrack, busy: isLoading }}
        >
          <View style={styles.playIconContainer}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color={playGlyphColor} style={{ marginLeft: isPlaying ? 0 : 2 }} />
            {isLoading && (
              <Animated.View style={[styles.loaderOverlay, { transform: [{ rotate: spin }] }]}>
                <Ionicons name="sync" size={48} color={toRgba(playGlyphColor, 0.55)} />
              </Animated.View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={next}
          disabled={!canSkipNext}
          style={[styles.iconBtn, !canSkipNext && styles.iconBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Next track"
          accessibilityState={{ disabled: !canSkipNext }}
        >
          <Ionicons name="play-skip-forward" size={28} color={canSkipNext ? colors.text : colors.textMuted} />
        </TouchableOpacity>
        {lyricsAvailable ? (
          <TouchableOpacity
            onPress={() => setShowLyrics(!showLyrics)}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
            accessibilityState={{ selected: showLyrics }}
          >
            <Ionicons name="mic-outline" size={21} color={showLyrics ? palettePrimary : colors.textMuted} />
          </TouchableOpacity>
        ) : currentTrack ? (
          <TouchableOpacity
            onPress={() => toggleHeart(currentTrack)}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Favorite track"
          >
            <Ionicons
              name={isHearted(currentTrack.id) ? 'heart' : 'heart-outline'}
              size={21}
              color={isHearted(currentTrack.id) ? palettePrimary : colors.textMuted}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: { 
  background: string; 
  text: string; 
  textSecondary: string; 
  textMuted: string; 
  border: string; 
  primary: string; 
  surface: string; 
  error: string; 
  glass: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: SPACING.lg,
    },
    screenBackdropImage: {
      ...StyleSheet.absoluteFill,
      opacity: 0.28,
      transform: [{ scale: 1.08 }],
    },
    screenBackdropScrim: {
      ...StyleSheet.absoluteFill,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    headerButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: colors.glass,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    deleteButton: {
      width: 44,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteGlyph: {
      width: 13,
      alignItems: 'center',
      gap: 1,
    },
    deleteLid: {
      width: 11,
      height: 2,
      borderRadius: 1,
    },
    deleteBody: {
      width: 10,
      height: 9,
      borderWidth: 1.3,
      borderTopWidth: 1.6,
      borderRadius: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingTop: 1,
    },
    deleteStem: {
      width: 1.2,
      height: 4,
      borderRadius: 1,
    },
    headerSpacer: {
      flex: 1,
    },
    artWrap: {
      width: '100%',
      aspectRatio: 1,
      marginBottom: SPACING.xl,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 15,
    },
    art: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
    },
    metaWrap: {
      marginBottom: SPACING.md,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '900',
      marginBottom: 4,
      letterSpacing: -0.5,
    },
    artist: {
      color: colors.textSecondary,
      fontSize: 18,
      fontWeight: '600',
      marginBottom: SPACING.md,
    },
    sourceChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      maxWidth: '100%',
    },
    sourceText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    progressWrap: {
      marginBottom: SPACING.md,
    },
    seekTouchArea: {
      width: '100%',
      height: 32,
      justifyContent: 'center',
    },
    seekTrack: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: 'visible',
    },
    seekTrackFill: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.text,
    },
    seekThumb: {
      position: 'absolute',
      top: -4,
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: -4,
    },
    timeText: {
      color: colors.textMuted,
      fontSize: FONT_SIZES.xs,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.md,
      marginTop: SPACING.sm,
      paddingBottom: SPACING.xl,
    },
    iconBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.glass,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnDisabled: {
      opacity: 0.45,
    },
    playBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
      elevation: 8,
    },
    playIconContainer: {
      width: 72,
      height: 72,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loaderOverlay: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

function getNowPlayingPalette(result: ImageColorsResult, fallback: string) {
  if (result.platform === 'ios') {
    return {
      dominant: result.background || fallback,
      vibrant: result.primary || fallback,
      muted: result.secondary || fallback,
      detail: result.detail || fallback,
    };
  }
  if (result.platform === 'android') {
    return {
      dominant: result.dominant || fallback,
      vibrant: result.vibrant || result.lightVibrant || fallback,
      muted: result.muted || result.darkMuted || fallback,
      detail: result.darkVibrant || result.average || fallback,
    };
  }
  // Web / fallback
  return {
    dominant: result.dominant || fallback,
    vibrant: result.vibrant || result.lightVibrant || fallback,
    muted: result.muted || result.darkMuted || fallback,
    detail: result.darkVibrant || fallback,
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

function getReadableTextColor(background: string) {
  return contrastRatio('#FFFFFF', background) >= 3 ? '#FFFFFF' : '#111111';
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
