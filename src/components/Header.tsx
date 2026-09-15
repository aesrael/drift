import React, { useMemo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';

interface HeaderProps {
  title?: string;
  showUser?: boolean;
  onUserPress?: () => void;
  rightAction?: ReactNode;
}

export function Header({ title, showUser = false, onUserPress, rightAction }: HeaderProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.right}>
        {rightAction}
        {showUser && (
          <TouchableOpacity onPress={onUserPress} style={styles.userButton}>
            <Text style={styles.userIcon}>👤</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: { background: string; text: string }) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: 'bold',
      color: colors.text,
    },
    right: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    userButton: {
      padding: SPACING.sm,
    },
    userIcon: {
      fontSize: 24,
    },
  });
