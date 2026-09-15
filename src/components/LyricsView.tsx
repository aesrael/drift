import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useProgress } from 'react-native-track-player';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES } from '../constants/theme';

interface LyricsLine {
  time: number; // in milliseconds
  text: string;
}

interface LyricsViewProps {
  lyrics: string;
  syncedLrc?: string;
  onSeek?: (time: number) => void;
}

const { height: WINDOW_HEIGHT, width: WINDOW_WIDTH } = Dimensions.get('window');

export function LyricsView({ lyrics, syncedLrc, onSeek }: LyricsViewProps) {
  const { position } = useProgress(100); 
  const currentTime = position * 1000; // Convert seconds to milliseconds for sync logic
  const { colors, isDark } = useTheme();
  const styles = createStyles(colors, isDark);
  const scrollRef = useRef<ScrollView>(null);
  const itemHeights = useRef<Record<number, number>>({});

  const lines = React.useMemo(() => {
    if (!syncedLrc) return null;
    
    const parsedLines: LyricsLine[] = [];
    const lrcRegex = /\[(\d+):(\d+\.\d+)\](.*)/g;
    let match;
    
    while ((match = lrcRegex.exec(syncedLrc)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const time = (minutes * 60 + seconds) * 1000;
      const text = match[3].trim();
      if (text) {
        parsedLines.push({ time, text });
      }
    }
    return parsedLines.length > 0 ? parsedLines : null;
  }, [syncedLrc]);

  const activeIndex = React.useMemo(() => {
    if (!lines) return -1;
    let index = -1;
    for (let i = 0; i < lines.length; i++) {
        if (currentTime >= lines[i].time) {
            index = i;
        } else {
            break;
        }
    }
    return index;
  }, [lines, currentTime]);

  useEffect(() => {
    if (activeIndex >= 0 && scrollRef.current) {
        let offset = 0;
        for (let i = 0; i < activeIndex; i++) {
            offset += itemHeights.current[i] || 56;
        }
        const activeItemHeight = itemHeights.current[activeIndex] || 56;
        const paddingTop = WINDOW_HEIGHT * 0.22; // Match styles.syncedContainer paddingTop
        // Position at the top 1/4 of the screen instead of centering, 
        // which helps visibility with the top/bottom fades.
        const scrollMargin = 80; // Distance from absolute top edge
        const targetY = offset + paddingTop - scrollMargin;
        
        scrollRef.current.scrollTo({ 
            y: Math.max(0, targetY), 
            animated: true 
        });
    }
  }, [activeIndex]);

  const renderStatus = (isSynced: boolean) => (
    <View style={styles.statusRow}>
        <View style={[styles.badge, { backgroundColor: isSynced ? colors.primary + '15' : colors.surface }]}>
            <Text style={[styles.badgeText, { color: isSynced ? colors.primary : colors.textSecondary }]}>
                {isSynced ? '● SYNCED' : 'STATIC TEXT'}
            </Text>
        </View>
    </View>
  );

  if (!lines) {
    return (
      <View style={styles.flex}>
        {renderStatus(false)}
        <ScrollView contentContainerStyle={styles.plainContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.plainText}>{lyrics}</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {renderStatus(true)}
      
      <ScrollView 
          ref={scrollRef}
          contentContainerStyle={styles.syncedContainer}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
      >
        {lines.map((line, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          return (
            <TouchableOpacity 
              key={index} 
              activeOpacity={0.7}
              onPress={() => onSeek?.(line.time)}
              onLayout={(e) => {
                  itemHeights.current[index] = e.nativeEvent.layout.height;
              }}
              style={styles.lineTouch}
            >
              <Text style={[
                  styles.lineText, 
                  isActive && styles.activeLine,
                  !isActive && { opacity: isPast ? 0.5 : 0.25 }
              ]}>
                {line.text}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: WINDOW_HEIGHT * 0.4 }} />
      </ScrollView>

      {/* Removed Edge Fades for Stability */}
      <View style={styles.topFade} pointerEvents="none" />
      <View style={styles.bottomFade} pointerEvents="none" />
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  plainContainer: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
    paddingTop: 80,
  },
  plainText: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 32,
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  syncedContainer: {
    paddingHorizontal: SPACING.xl,
    paddingTop: WINDOW_HEIGHT * 0.22,
  },
  lineTouch: {
    paddingVertical: 12,
  },
  lineText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 38,
    textAlign: 'left',
    letterSpacing: -0.8,
  },
  activeLine: {
    color: colors.primary,
    fontSize: 32,
    opacity: 1,
    transform: [{ scale: 1.02 }],
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 15,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 15,
  }
});
