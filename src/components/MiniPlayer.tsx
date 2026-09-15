import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ViewStyle, Animated, Easing, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { Track } from '../types';
import { DiskArtwork } from './DiskArtwork';

interface MiniPlayerProps {
  track: Track | null;
  isPlaying: boolean;
  progress: number; // 0-1
  onPlayPause: () => void;
  onPress: () => void;
  onHeart: () => void;
  onPurge?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  canSkipNext?: boolean;
  canSkipPrevious?: boolean;
  isHearted: boolean;
  isLoading?: boolean;
  coverUrl?: string | null;
  style?: ViewStyle;
}

export function MiniPlayer({ 
  track, 
  isPlaying, 
  progress, 
  onPlayPause, 
  onPress, 
  onHeart, 
  onPurge,
  onNext,
  onPrevious,
  canSkipNext = true,
  canSkipPrevious = true,
  isHearted, 
  isLoading = false,
  coverUrl, 
  style 
}: MiniPlayerProps) {
  if (!track) return null;

  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;
  const styles = useMemo(() => createStyles(colors, bottomInset), [colors, bottomInset]);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [coverFailed, setCoverFailed] = useState(false);
  const clickCount = useRef(0);
  const lastClickTime = useRef(0);

  const handlePress = () => {
    const now = Date.now();
    const diff = now - lastClickTime.current;

    if (diff < 500) { // 500ms between clicks
      clickCount.current += 1;
    } else {
      clickCount.current = 1;
    }
    lastClickTime.current = now;

    if (clickCount.current === 3) {
      clickCount.current = 0;
      if (onPurge) {
        Alert.alert(
          "Purge Track?",
          `Are you sure you want to completely remove "${track.title}"?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Purge", style: "destructive", onPress: onPurge }
          ]
        );
      }
    } else {
      // Default action (open player)
      onPress();
    }
  };

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
      rotateAnim.setValue(0);
    }
  }, [isLoading]);

  useEffect(() => {
    setCoverFailed(false);
  }, [coverUrl]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity 
      style={[styles.miniPlayerContainer, style]} 
      onPress={handlePress} 
      activeOpacity={0.9}
    >
      <View style={[styles.miniPlayer, { backgroundColor: colors.surface }]}>
        {/* Progress bar */}
        <View style={styles.miniProgress}>
          <View style={[styles.miniProgressFill, { width: `${(Number.isNaN(progress) ? 0 : progress) * 100}%` }]} />
        </View>
        
        <View style={styles.miniContent}>
        {/* Album Art */}
        <View style={styles.coverContainer}>
        {coverUrl && !coverFailed ? (
          <Image source={{ uri: coverUrl }} style={styles.miniCover} onError={() => setCoverFailed(true)} />
        ) : (
          <View style={[styles.miniCover, styles.miniCoverPlaceholder]}>
            <DiskArtwork size={32} isSpinning={isPlaying} isLoading={isLoading} />
          </View>
        )}
        </View>
        
        {/* Track Info */}
        <View style={styles.miniInfo}>
          <Text style={styles.miniTitle} numberOfLines={1}>{track.title}</Text>
          <Text style={styles.miniArtist} numberOfLines={1}>{track.artist}</Text>
        </View>
        
        {/* Controls */}
        <View style={styles.miniControls}>
          <TouchableOpacity 
            style={styles.miniHeartBtn} 
            onPress={(e) => {
              e.stopPropagation();
              onHeart();
            }}
          >
            <Ionicons name={isHearted ? "heart" : "heart-outline"} size={20} color={isHearted ? colors.primary : colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.miniControlBtn} 
            onPress={(e) => {
              e.stopPropagation();
              if (onPrevious) onPrevious();
            }}
            disabled={!canSkipPrevious || !onPrevious}
          >
            <Ionicons 
              name="play-skip-back" 
              size={20} 
              color={canSkipPrevious && onPrevious ? colors.text : colors.textMuted} 
            />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.miniPlayBtn} 
            onPress={(e) => {
              e.stopPropagation();
              onPlayPause();
            }}
          >
            <View style={styles.iconContainer}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.text} />
              {isLoading && (
                <Animated.View style={[styles.loaderOverlay, { transform: [{ rotate: spin }] }]}>
                  <Ionicons name="sync" size={32} color={colors.primary} />
                </Animated.View>
              )}
            </View>
          </TouchableOpacity>

            <TouchableOpacity 
              style={styles.miniControlBtn} 
              onPress={(e) => {
                e.stopPropagation();
                if (onNext) onNext();
              }}
              disabled={!canSkipNext || !onNext}
            >
              <Ionicons 
                name="play-skip-forward" 
                size={20} 
                color={canSkipNext && onNext ? colors.text : colors.textMuted} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: { 
  surface: string; 
  background: string; 
  border: string; 
  primary: string; 
  textMuted: string; 
  text: string; 
  textSecondary: string;
  glass: string;
  glassBorder: string;
}, bottomInset: number = 0) =>
  StyleSheet.create({
    miniPlayerContainer: {
      position: 'absolute',
      bottom: 64 + bottomInset,
      left: 12,
      right: 12,
      zIndex: 100,
    },
    miniPlayer: {
      borderRadius: 20,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 10,
    },
    miniProgress: {
      height: 2,
      backgroundColor: 'rgba(255,255,255,0.05)',
      width: '100%',
    },
    miniProgressFill: {
      height: 2,
      backgroundColor: colors.primary,
    },
    miniContent: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.sm,
    },
    coverContainer: {
      // Container for cover to limit potential styling issues
    },
    miniCover: {
      width: 48,
      height: 48,
      borderRadius: 6,
    },
    miniCoverPlaceholder: {
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    miniCoverText: {
      fontSize: 20,
      color: colors.textMuted,
    },
    miniInfo: {
      flex: 1,
      marginLeft: SPACING.sm,
    },
    miniTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: colors.text,
    },
    miniArtist: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      fontWeight: '500',
      marginTop: 1,
    },
    miniControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    miniPlayBtn: {
      padding: SPACING.xs,
    },
    miniControlBtn: {
      padding: SPACING.xs,
    },
    miniHeartBtn: {
      padding: SPACING.xs,
      marginRight: SPACING.xs,
    },
    iconContainer: {
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loaderOverlay: {
      position: 'absolute',
      opacity: 0.8,
    },
  });
