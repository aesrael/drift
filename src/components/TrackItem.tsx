import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { Track } from '../types';
import { usePlayerActions } from '../context/PlayerContext';
import { getCoverArtUrlSync } from '../services/subsonic';
import { DiskArtwork } from './DiskArtwork';

interface TrackItemProps {
  track: Track;
  onPress: () => void;
  isPlaying?: boolean;
  showNumber?: boolean;
  showHeart?: boolean;
  isRemovalMode?: boolean;
  onRemove?: () => void;
  selected?: boolean;
  onLongPress?: () => void;
}

export const TrackItem = React.memo(function TrackItem({ track, onPress, isPlaying, showNumber, showHeart = true, isRemovalMode, onRemove, selected, onLongPress }: TrackItemProps) {
  const { toggleHeart } = usePlayerActions();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isHearted = !!track.starred;
  
  // Refined Fallback: Prefer albumId if coverArt is missing OR if coverArt is a temporary ID
  // This ensures we show valid album art instead of broken temp placeholders
  let coverId = track.coverArt;
  if ((!coverId || coverId.startsWith('temp-')) && track.albumId && !track.albumId.startsWith('temp-')) {
    coverId = track.albumId;
  }
  if (!coverId) {
     coverId = track.albumId || track.id;
  }

  const coverUrl = coverId ? getCoverArtUrlSync(coverId, 100) : null;
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => {
    setCoverFailed(false);
  }, [coverUrl]);

  return (
    <TouchableOpacity
      style={[styles.trackItem, isPlaying && styles.trackItemActive, selected && styles.trackItemSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.trackSelectIcon} />
      ) : (
        showNumber && <Text style={styles.trackNumber}>{track.trackNumber}</Text>
      )}
      <View style={styles.trackCover}>
        {coverUrl && !coverFailed ? (
          <Image key={coverUrl} source={{ uri: coverUrl }} style={styles.coverImage} onError={() => setCoverFailed(true)} />
        ) : (
          <DiskArtwork size={30} />
        )}
      </View>
      <View style={styles.trackInfo}>
        <Text style={[styles.trackTitle, isPlaying && styles.trackTitleActive]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track.artist}{track.year ? ` • ${track.year}` : ''}
        </Text>
      </View>
      
      {showHeart && !isRemovalMode && (
        <TouchableOpacity 
          style={styles.heartBtn} 
          onPress={(e) => {
            e.stopPropagation();
            toggleHeart(track);
          }}
        >
          <Ionicons 
            name={isHearted ? "heart" : "heart-outline"} 
            size={20} 
            color={isHearted ? colors.primary : colors.textMuted} 
          />
        </TouchableOpacity>
      )}

      {isRemovalMode && (
        <TouchableOpacity 
          style={styles.heartBtn} 
          onPress={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
        >
          <Ionicons 
            name="trash-outline" 
            size={20} 
            color={colors.error || '#FF3B30'} 
          />
        </TouchableOpacity>
      )}

      <Text style={styles.trackDuration}>
        {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
      </Text>
    </TouchableOpacity>
  );
});

const createStyles = (colors: { border: string; surfaceLight: string; textMuted: string; text: string; primary: string; textSecondary: string; error: string }) =>
  StyleSheet.create({
    trackItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: 10,
    },
    trackItemActive: {
      backgroundColor: colors.surfaceLight,
      borderRadius: 8,
    },
    trackItemSelected: {
      backgroundColor: colors.surfaceLight,
      borderRadius: 8,
    },
    trackSelectIcon: {
      width: 24,
    },
    trackNumber: {
      width: 24,
      fontSize: FONT_SIZES.sm,
      color: colors.textMuted,
      textAlign: 'center',
    },
    trackCover: {
      width: 48,
      height: 48,
      borderRadius: 4,
      backgroundColor: colors.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    coverImage: {
      width: '100%',
      height: '100%',
    },
    trackCoverText: {
      fontSize: 18,
      color: colors.textMuted,
    },
    trackInfo: {
      flex: 1,
      marginLeft: SPACING.sm,
      justifyContent: 'center',
    },
    trackTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    trackTitleActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    trackArtist: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
    },
    trackDuration: {
      fontSize: FONT_SIZES.sm,
      color: colors.textMuted,
      marginLeft: SPACING.sm,
    },
    heartBtn: {
      padding: SPACING.xs,
      marginRight: SPACING.xs,
    },
  });
