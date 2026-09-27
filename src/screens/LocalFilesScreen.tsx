import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
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
  hideTrackIds,
  getHiddenTrackIds,
  restoreHiddenTracks,
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const { currentTrack } = usePlayerState();
  const { play, purgeTrack } = usePlayerActions();
  const selecting = selectedIds.length > 0;

  const playAll = useCallback(() => {
    if (tracks.length === 0) return;
    play(tracks[0], tracks);
  }, [play, tracks]);

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
      setHiddenCount((await getHiddenTrackIds()).length);
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
        selected={selectedIds.includes(item.id)}
        isPlaying={currentTrack?.id === item.id}
        onLongPress={() => {
          setSelectedIds((prev) =>
            prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
          );
        }}
        onPress={() => {
          if (selecting) {
            setSelectedIds((prev) =>
              prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
            );
            return;
          }
          // Tapping the currently playing song opens NowPlaying instead of replaying.
          if (currentTrack?.id === item.id) {
            navigation.navigate('NowPlaying');
            return;
          }
          play(item, tracks);
        }}
      />
    ),
    [currentTrack?.id, navigation, play, selecting, selectedIds, tracks]
  );

  const confirmRemoveSelected = useCallback(() => {
    const count = selectedIds.length;
    if (count === 0) return;
    Alert.alert(
      'Remove from list',
      count === 1
        ? 'Remove this song from your Drift list? Your file stays on this device.'
        : `Remove these ${count} songs from your Drift list? Your files stay on this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const ids = selectedIds;
            setSelectedIds([]);
            setTracks((prev) => prev.filter((t) => !ids.includes(t.id)));
            await hideTrackIds(ids);
            setHiddenCount((await getHiddenTrackIds()).length);
            for (const id of ids) {
              const track = tracks.find((t) => t.id === id);
              if (track) await purgeTrack(track).catch(() => {});
            }
          },
        },
      ]
    );
  }, [selectedIds, tracks, purgeTrack]);

  const restoreHidden = useCallback(async () => {
    await restoreHiddenTracks();
    setHiddenCount(0);
    scan();
  }, [scan]);

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
        <View style={styles.listWrap}>
          <FlatList
            data={tracks}
            keyExtractor={(t) => t.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View>
                <View style={styles.topButtons}>
                  <TouchableOpacity style={styles.topButtonPrimary} onPress={playAll}>
                    <Text style={styles.shuffleText}>Play</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.topButton} onPress={shuffleAll}>
                    <Text style={styles.topButtonText}>Shuffle ({tracks.length})</Text>
                  </TouchableOpacity>
                </View>
                {hiddenCount > 0 && (
                  <TouchableOpacity onPress={restoreHidden} style={styles.restoreBtn}>
                    <Text style={styles.restoreText}>Restore {hiddenCount} hidden {hiddenCount === 1 ? 'song' : 'songs'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
          {selecting && (
            <View style={styles.selectionBar}>
              <TouchableOpacity onPress={() => setSelectedIds([])} style={styles.selectionCancel}>
                <Text style={styles.topButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRemoveSelected} style={styles.selectionRemove}>
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.shuffleText}> Remove ({selectedIds.length})</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    listWrap: { flex: 1 },
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
    topButtons: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginVertical: SPACING.sm,
    },
    topButtonPrimary: {
      flex: 1,
      backgroundColor: colors.primary,
      paddingVertical: SPACING.md,
      borderRadius: 10,
      alignItems: 'center',
    },
    topButton: {
      flex: 1,
      paddingVertical: SPACING.md,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.primary,
    },
    topButtonText: { color: colors.primary, fontSize: FONT_SIZES.md, fontWeight: '600' },
    restoreBtn: { alignItems: 'center', paddingVertical: SPACING.xs },
    restoreText: { color: colors.textMuted, fontSize: FONT_SIZES.sm },
    selectionBar: {
      flexDirection: 'row',
      gap: SPACING.sm,
      padding: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    selectionCancel: {
      flex: 1,
      paddingVertical: SPACING.md,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    selectionRemove: {
      flex: 2,
      flexDirection: 'row',
      backgroundColor: colors.error ?? '#FF3B30',
      paddingVertical: SPACING.md,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
