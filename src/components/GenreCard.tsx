import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';

interface GenreCardProps {
  name: string;
  count: number;
  onPress: () => void;
}

export function GenreCard({ name, count, onPress }: GenreCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.genreCard} onPress={onPress}>
      <View style={styles.genreIcon}>
        <Text style={styles.genreIconText}>{name && name.charAt(0) ? name.charAt(0).toUpperCase() : '?'}</Text>
      </View>
      <Text style={styles.genreName} numberOfLines={1}>{name}</Text>
      <Text style={styles.genreCount}>{count} songs</Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: { surface: string; surfaceLight: string; primary: string; text: string; textSecondary: string }) =>
  StyleSheet.create({
    genreCard: {
      width: 120,
      marginRight: SPACING.md,
      backgroundColor: colors.surface,
      padding: SPACING.md,
      borderRadius: 12,
    },
    genreIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: `${colors.primary}22`,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    genreIconText: {
      fontSize: 20,
      color: colors.primary,
      fontWeight: '700',
    },
    genreName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    genreCount: {
      fontSize: FONT_SIZES.xs,
      color: colors.textSecondary,
    },
  });
