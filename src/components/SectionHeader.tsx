import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONT_SIZES, SPACING } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';

interface SectionHeaderProps {
  title: string;
  onSeeAllPress?: () => void;
  seeAllLabel?: string;
}

export function SectionHeader({ title, onSeeAllPress, seeAllLabel = 'See all' }: SectionHeaderProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAllPress ? (
        <TouchableOpacity onPress={onSeeAllPress}>
          <Text style={styles.seeAll}>{seeAllLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View />
      )}
    </View>
  );
}

const createStyles = (colors: { text: string; primary: string }) =>
  StyleSheet.create({
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.md,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.5,
    },
    seeAll: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: colors.primary,
    },
  });
