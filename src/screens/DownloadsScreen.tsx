import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { Track } from '../types';
import { getStarred } from '../services/subsonic';
import { getDownloadedTracks } from '../services/downloadService';
import { Header, TrackItem } from '../components';
import { usePlayerActions, usePlayerState } from '../context/PlayerContext';
import { useFocusEffect } from '@react-navigation/native';

const STARRED_CACHE_KEY = 'downloads_starred_cache_v1';

async function loadStarredCache(): Promise<Track[]> {
  try {
    const raw = await AsyncStorage.getItem(STARRED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveStarredCache(tracks: Track[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STARRED_CACHE_KEY, JSON.stringify(tracks || []));
  } catch {
    // best-effort cache write
  }
}

export function DownloadsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [downloadedTracks, setDownloadedTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const { currentTrack, starredTrackIds } = usePlayerState();
  const { play } = usePlayerActions();

  const loadData = useCallback(async () => {
    setLoading(true);
    // 1) Fast offline-first snapshot from local disk + cached starred.
    const [localResult, cachedStarredResult] = await Promise.allSettled([
      getDownloadedTracks(),
      loadStarredCache(),
    ]);

    const localTracks: Track[] = localResult.status === 'fulfilled' ? localResult.value : [];
    const cachedStarredTracks: Track[] = cachedStarredResult.status === 'fulfilled' ? cachedStarredResult.value : [];

    if (localResult.status === 'rejected') {
      console.warn('Downloads local fetch failed:', localResult.reason);
    }
    if (cachedStarredResult.status === 'rejected') {
      console.warn('Downloads starred cache read failed:', cachedStarredResult.reason);
    }

    const mergeUnique = (base: Track[], extra: Track[]) => {
      const seenIds = new Set<string>();
      const seenTitles = new Set<string>();
      const result: Track[] = [];

      const addTrack = (track: Track) => {
        const titleKey = `${track.title.toLowerCase().trim()}|${track.artist.toLowerCase().trim()}`;
        if (!seenIds.has(track.id) && !seenTitles.has(titleKey)) {
          seenIds.add(track.id);
          seenTitles.add(titleKey);
          result.push(track);
        }
      };

      base.forEach(addTrack);
      extra.forEach(addTrack);
      return result;
    };

    setDownloadedTracks(localTracks);
    setTracks(mergeUnique(localTracks, cachedStarredTracks));

    // 2) Best-effort online refresh for starred; keep cached/local if offline.
    try {
      const starredData = await getStarred();
      const freshStarred = starredData.tracks || [];
      await saveStarredCache(freshStarred);
      setTracks(mergeUnique(localTracks, freshStarred));
    } catch (error) {
      console.warn('Downloads starred fetch failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Keep Downloads list in sync after heart toggles.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 150);
    return () => clearTimeout(timer);
  }, [starredTrackIds, loadData]);

  const handleTrackPress = (track: Track) => {
    // Keep the queue limited to locally downloaded tracks so auto-next
    // does not jump to non-downloaded items.
    const playableQueue = downloadedTracks.length > 0 ? downloadedTracks : tracks;
    play(track, playableQueue, true, { kind: 'downloads', label: 'Downloads' });
  };

  return (
    <View style={styles.container}>
      <Header title="Downloads" />
      
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TrackItem
            track={{
              ...item,
              starred: starredTrackIds.includes(item.id) ? '1' : undefined,
            }}
            onPress={() => handleTrackPress(item)}
            isPlaying={currentTrack?.id === item.id}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="heart-dislike-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>No starred or downloaded tracks yet.</Text>
          </View>
        }
        refreshing={loading}
        onRefresh={loadData}
      />
    </View>
  );
}

const createStyles = (colors: { background: string; textMuted: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      padding: SPACING.md,
      paddingBottom: 150, // More space for mini player and tab bar
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 100,
    },
    emptyText: {
      color: colors.textMuted,
      marginTop: SPACING.md,
      fontSize: FONT_SIZES.md,
      textAlign: 'center',
    },
  });
