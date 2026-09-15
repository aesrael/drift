import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, StyleProp, ViewStyle } from 'react-native';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { formatTotalDuration } from '../utils/format';

interface AlbumCardProps {
  name: string;
  artist: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export const AlbumCard = React.memo(function AlbumCard({ name, artist, coverArt, songCount, duration, onPress, style }: AlbumCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={[styles.albumCard, style]} onPress={onPress}>
      <View style={styles.albumCover}>
        {coverArt ? (
          <Image source={{ uri: coverArt }} style={styles.albumCoverImage} />
        ) : (
          <Text style={styles.albumCoverText}>♪</Text>
        )}
      </View>
      <Text style={styles.albumName} numberOfLines={1}>{name}</Text>
      <Text style={styles.albumArtist} numberOfLines={1}>{artist}</Text>
      {songCount !== undefined && duration !== undefined && (
        <Text style={styles.albumInfo} numberOfLines={1}>
          {songCount} songs • {formatTotalDuration(duration)}
        </Text>
      )}
    </TouchableOpacity>
  );
});

const createStyles = (colors: { surface: string; textMuted: string; text: string; textSecondary: string }) =>
  StyleSheet.create({
    albumCard: {
      width: '48%',
      marginBottom: SPACING.md,
    },
    albumCover: {
      aspectRatio: 1,
      borderRadius: 8,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    albumCoverImage: {
      width: '100%',
      height: '100%',
      borderRadius: 8,
    },
    albumCoverText: {
      fontSize: 40,
      color: colors.textMuted,
    },
    albumName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: colors.text,
    },
    albumArtist: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
    },
    albumInfo: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
