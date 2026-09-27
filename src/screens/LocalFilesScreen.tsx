import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { Track } from '../types';
import { Header, TrackItem } from '../components';
import { usePlayerActions, usePlayerState } from '../context/PlayerContext';
import {
  requestLocalAudioPermission,
  scanLocalAudio,
} from '../services/localLibrary';

export function LocalFilesScreen({ navigation }: any) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const autoScannedRef = useRef(false);
  const { currentTrack } = usePlayerState();
  const { play } = usePlayerActions();

  const shuffleAll = useCallback(() => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    play(shuffled[0], shuffled);
  }, [play, tracks]);

  const scan = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    setScanError(null);
    try {
      const granted = await requestLocalAudioPermission();
      if (!granted) {
        setDenied(true);
        return;
      }
      const found = await scanLocalAudio();
      setTracks(found);
      setScanned(true);
    } catch (e) {
      console.warn('Local scan failed', e);
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!autoScannedRef.current) {
        autoScannedRef.current = true;
        scan();
      }
    }, [scan])
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <TrackItem
        track={item}
        showNumber
        showHeart={false}
        isPlaying={currentTrack?.id === item.id}
        onPress={() => {
          // Tapping the currently playing song opens NowPlaying instead of replaying.
          if (currentTrack?.id === item.id) {
            navigation.navigate('NowPlaying');
            return;
          }
          play(item, tracks);
        }}
      />
    ),
    [currentTrack?.id, navigation, play, tracks]
  );

  return (
    <View style={styles.container}>
      <Header
        title="On this device"
        rightAction={
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={scan} style={styles.headerBtn} disabled={loading}>
              <Ionicons name="refresh-outline" size={22} color={loading ? colors.textMuted : colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Ionicons name="person-circle-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.hint}>Scanning for audio files…</Text>
        </View>
      ) : denied ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Audio access was denied.</Text>
          <TouchableOpacity style={styles.button} onPress={scan}>
            <Text style={styles.buttonText}>Grant access and rescan</Text>
          </TouchableOpacity>
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.hint}>
            {scanError
              ? `Scan failed: ${scanError}`
              : scanned
                ? 'No audio files found on this device.'
                : 'No local files scanned yet.'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={scan}>
            <Text style={styles.buttonText}>Scan again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <TouchableOpacity style={styles.shuffleButton} onPress={shuffleAll}>
              <Text style={styles.shuffleText}>Shuffle all ({tracks.length})</Text>
            </TouchableOpacity>
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    list: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
    hint: {
      color: colors.textMuted,
      fontSize: FONT_SIZES.md,
      textAlign: 'center',
      marginTop: SPACING.md,
    },
    button: {
      marginTop: SPACING.lg,
      backgroundColor: colors.primary,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderRadius: 10,
    },
    buttonText: { color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '600' },
    shuffleButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderRadius: 10,
      alignItems: 'center',
      marginVertical: SPACING.sm,
    },
    shuffleText: { color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '600' },
    headerBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  });
}
