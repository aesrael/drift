import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/theme';
import { Playlist } from '../types';
import { formatTotalDuration } from '../utils/format';

interface ChartCardProps {
  playlist: Playlist;
  onPress: () => void;
  gradientColors: readonly [string, string, ...string[]];
}

export const ChartCard = React.memo(function ChartCard({ playlist, onPress, gradientColors }: ChartCardProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <View
        style={[styles.gradient, { backgroundColor: gradientColors[0] }]}
      >
        {/* Subtle icon decoration */}
        <Ionicons 
          name="trending-up" 
          size={28} 
          color="rgba(255,255,255,0.12)" 
          style={styles.iconContainer}
        />

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{playlist.name}</Text>
          <Text style={styles.details} numberOfLines={1}>
            {playlist.songCount} {playlist.songCount === 1 ? 'track' : 'tracks'} • {formatTotalDuration(playlist.duration || 0)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '48%',
    height: 140,
    marginBottom: SPACING.md,
  },
  gradient: {
    flex: 1,
    borderRadius: 12,
    padding: SPACING.md,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  iconContainer: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
  },
  artwork: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },

  artworkPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    gap: 6,
    marginTop: 'auto',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  details: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
});
