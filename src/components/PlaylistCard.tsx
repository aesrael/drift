import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';

interface PlaylistCardProps {
  name: string;
  songCount: number;
  coverArt?: string;
  onPress: () => void;
}

export function PlaylistCard({ name, songCount, coverArt, onPress }: PlaylistCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.playlistCard} onPress={onPress}>
      <View style={styles.playlistCover}>
        {coverArt ? (
          <Image source={{ uri: coverArt }} style={styles.playlistCoverImage} />
        ) : (
          <Text style={styles.playlistCoverText}>♪</Text>
        )}
      </View>
      <Text style={styles.playlistName} numberOfLines={2}>{name}</Text>
      <Text style={styles.playlistCount}>{songCount} tracks</Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: { surface: string; textMuted: string; text: string; textSecondary: string }) =>
  StyleSheet.create({
    playlistCard: {
      width: '48%',
      marginBottom: SPACING.md,
    },
    playlistCover: {
      aspectRatio: 1,
      borderRadius: 8,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    playlistCoverImage: {
      width: '100%',
      height: '100%',
      borderRadius: 8,
    },
    playlistCoverText: {
      fontSize: 40,
      color: colors.textMuted,
    },
    playlistName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: colors.text,
    },
    playlistCount: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
    },
  });
