import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

interface NowPlayingPlayerProps {
  isPlaying: boolean;
  position: number;
  duration: number;
  showShuffle?: boolean;
  showRepeat?: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onShuffle?: () => void;
  onRepeat?: () => void;
  isLoading?: boolean;
}

export function NowPlayingPlayer({
  isPlaying,
  position,
  duration,
  showShuffle = true,
  showRepeat = true,
  onPlayPause,
  onNext,
  onPrevious,
  onShuffle,
  onRepeat,
  isLoading = false,
}: NowPlayingPlayerProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
      rotateAnim.setValue(0);
    }
  }, [isLoading]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  
  const formatTime = (ms: number) => {
    if (!ms || ms === 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${(position / duration) * 100}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>–{formatTime(duration - position)}</Text>
        </View>
      </View>

      {/* Control Row */}
      <View style={styles.controlRow}>
        {showShuffle && onShuffle ? (
          <TouchableOpacity style={styles.controlBtn} onPress={onShuffle}>
            <Ionicons name="shuffle" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.controlBtn} />
        )}
        
        <TouchableOpacity onPress={onPrevious} style={styles.controlBtn}>
          <Ionicons name="play-skip-back" size={32} color={colors.text} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.mainPlayButton} onPress={onPlayPause}>
          <View style={styles.playIconContainer}>
            <Ionicons 
              name={isPlaying ? 'pause' : 'play'} 
              size={36} 
              color={colors.text}
              style={{ marginLeft: isPlaying ? 0 : 4 }}
            />
            {isLoading && (
              <Animated.View style={[styles.loaderOverlay, { transform: [{ rotate: spin }] }]}>
                <Ionicons name="sync" size={44} color={colors.primary} style={{ opacity: 0.6 }} />
              </Animated.View>
            )}
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={onNext} style={styles.controlBtn}>
          <Ionicons name="play-skip-forward" size={32} color={colors.text} />
        </TouchableOpacity>
        
        {showRepeat && onRepeat ? (
          <TouchableOpacity style={styles.controlBtn} onPress={onRepeat}>
            <Ionicons name="repeat" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.controlBtn} />
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: { border: string; primary: string; textMuted: string; surface: string }) =>
  StyleSheet.create({
    container: {
      width: '100%',
      paddingHorizontal: SPACING.lg,
    },
    progressSection: {
      width: '100%',
      marginBottom: SPACING.md,
    },
    progressBarBg: {
      width: '100%',
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: 6,
      backgroundColor: colors.primary,
      borderRadius: 3,
      shadowColor: colors.primary,
      shadowOpacity: 0.5,
      shadowRadius: 4,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.xs,
    },
    timeText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-evenly',
      width: '100%',
      marginTop: SPACING.sm,
    },
    controlBtn: {
      padding: SPACING.sm,
      minWidth: 40,
      alignItems: 'center',
    },
    mainPlayButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    playIconContainer: {
      width: 70,
      height: 70,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loaderOverlay: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
