import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { SPACING } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { Skeleton } from './Skeleton';

export function PlaylistCardSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.playlistCard}>
      <Skeleton width={140} height={140} borderRadius={8} />
      <Skeleton width={120} height={16} style={{ marginTop: SPACING.xs }} />
      <Skeleton width={80} height={12} style={{ marginTop: 4 }} />
    </View>
  );
}

export function TrackItemSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.trackItem}>
      <Skeleton width={48} height={48} borderRadius={6} />
      <View style={styles.trackInfo}>
        <Skeleton width="80%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="60%" height={12} />
      </View>
    </View>
  );
}

export function CollectionHeaderSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.collectionHeader}>
      <Skeleton width={200} height={200} borderRadius={8} style={{ marginBottom: SPACING.md }} />
      <Skeleton width={180} height={24} style={{ marginBottom: 8 }} />
      <Skeleton width={120} height={16} />
    </View>
  );
}

export function HorizontalTrackListSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.horizontalList}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.horizontalTrack}>
          <Skeleton width={100} height={100} borderRadius={6} />
          <Skeleton width={90} height={14} style={{ marginTop: SPACING.xs }} />
          <Skeleton width={70} height={12} style={{ marginTop: 4 }} />
        </View>
      ))}
    </View>
  );
}

export function PlaylistsScreenSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Skeleton width={120} height={28} />
      </View>
      <View style={styles.grid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <PlaylistCardSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

export function CollectionDetailsScreenSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <CollectionHeaderSkeleton />
      <View style={{ paddingHorizontal: SPACING.md }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <TrackItemSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

export function QuickPlaySkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {/* Hero section */}
      <View style={styles.heroSection}>
        <Skeleton width={200} height={200} borderRadius={12} style={{ marginBottom: SPACING.lg }} />
        <Skeleton width={180} height={24} style={{ marginBottom: 8 }} />
        <Skeleton width={120} height={16} style={{ marginBottom: SPACING.lg }} />
        
        {/* Controls */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <Skeleton width={70} height={70} borderRadius={35} />
          <Skeleton width={40} height={40} borderRadius={20} />
        </View>
      </View>

      {/* Sections */}
      <View style={{ marginTop: SPACING.xl }}>
        <Skeleton width={120} height={20} style={{ marginLeft: SPACING.md, marginBottom: SPACING.sm }} />
        <HorizontalTrackListSkeleton />
      </View>
      
      <View style={{ marginTop: SPACING.lg }}>
        <Skeleton width={100} height={20} style={{ marginLeft: SPACING.md, marginBottom: SPACING.sm }} />
        <HorizontalTrackListSkeleton />
      </View>
    </View>
  );
}

const createStyles = (colors: { background: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: 50,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: SPACING.md,
      gap: SPACING.md,
    },
    playlistCard: {
      width: 140,
      marginBottom: SPACING.md,
    },
    trackItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    trackInfo: {
      flex: 1,
    },
    collectionHeader: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.md,
    },
    horizontalList: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    horizontalTrack: {
      width: 100,
    },
    heroSection: {
      alignItems: 'center',
      paddingTop: 50,
      paddingBottom: SPACING.lg,
    },
  });
