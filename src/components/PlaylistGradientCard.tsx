import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/theme';
import { Playlist } from '../types';
import { getCoverArtUrl, getPlaylistArtUrls } from '../services/subsonic';
import { Image } from 'react-native';
import { formatTotalDuration } from '../utils/format';

const { width } = Dimensions.get('window');

interface PlaylistGradientCardProps {
  playlist: Playlist;
  onPress: () => void;
  gradientColors: readonly [string, string, ...string[]];
}

export const PlaylistGradientCard = React.memo(function PlaylistGradientCard({ playlist, onPress, gradientColors }: PlaylistGradientCardProps) {
  const [coverUrl, setCoverUrl] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    let mounted = true;
    
    const loadArt = async () => {
      try {
        // Try playlist.coverArt first (instant if available)
        if (playlist.coverArt) {
          const cacheBust = playlist.changed || playlist.created;
          const url = await getCoverArtUrl(playlist.coverArt, 300, cacheBust);
          if (mounted) setCoverUrl(url);
          return;
        }
        
        // Fallback to getPlaylistArtUrls (cached after first fetch)
        const cacheBust = playlist.changed || playlist.created;
        const urls = await getPlaylistArtUrls(playlist, 1, cacheBust);
        if (mounted && urls.length > 0) {
          setCoverUrl(urls[0]);
        }
      } catch (error) {
        if (mounted) setCoverUrl(undefined);
      }
    };
    
    loadArt();
    return () => { mounted = false; };
  }, [playlist.id, playlist.coverArt, playlist.changed, playlist.created]);

  const renderArtwork = () => {
    if (!coverUrl) {
      return (
        <View style={styles.artworkPlaceholder}>
          <Ionicons name="musical-notes" size={60} color="rgba(255,255,255,0.5)" />
        </View>
      );
    }

    return <Image source={{ uri: coverUrl }} style={styles.artwork} />;
  };

  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <View
        style={[styles.gradient, { backgroundColor: gradientColors[0] }]}
      >
        {/* Artwork */}
        <View style={styles.artworkContainer}>
          {renderArtwork()}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{playlist.name}</Text>
          <Text style={styles.songCount}>
            {playlist.songCount} songs • {formatTotalDuration(playlist.duration || 0)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: 280,
    height: 200,
    marginRight: SPACING.md,
  },
  gradient: {
    flex: 1,
    borderRadius: 16,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  artworkContainer: {
    alignSelf: 'flex-start',
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden', // Clip grid
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },

  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    marginTop: SPACING.sm,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  songCount: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
});
