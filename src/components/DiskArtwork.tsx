import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Image } from 'react-native';
import { useThemeColors } from '../context/ThemeContext';

interface DiskArtworkProps {
  size: number;
  isSpinning?: boolean;
  isLoading?: boolean;
  color?: string;
}

export function DiskArtwork({ size, isSpinning = false, isLoading = false, color }: DiskArtworkProps) {
  const colors = useThemeColors();
  const accentColor = color ?? colors.tertiary;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const shouldSpin = isSpinning || isLoading;

  useEffect(() => {
    if (shouldSpin) {
      const duration = isLoading ? 1200 : 12000;
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation(() => {
        rotateAnim.setValue(0);
      });
    }
  }, [shouldSpin, isLoading, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const safeSize = size || 0;
  const labelSize = safeSize * 0.38;
  const holeSize = safeSize * 0.08;
  
  // Premium Vinyl - OLED Optimized
  const DISK_COLOR = '#121212'; // Near black vinyl
  const DISK_HIGHLIGHT = '#1A1A1A'; 
  const DISK_DARK = '#050505'; 
  const LABEL_COLOR = '#F5F5F5'; // Off-white label
  const LABEL_ACCENT = accentColor;
  
  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <View
        style={[
          styles.disk,
          {
            width: safeSize,
            height: safeSize,
            borderRadius: safeSize / 2,
            backgroundColor: DISK_DARK,
            overflow: 'hidden',
          },
        ]}
      >
        {/* Main vinyl surface */}
        <View style={[styles.vinylSurface, { width: safeSize, height: safeSize, borderRadius: safeSize / 2, backgroundColor: DISK_COLOR }]} />
        
        {/* Fine concentric groove rings */}
        {[0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50].map((scale, i) => (
          <View
            key={i}
            style={[
              styles.grooveRing,
              {
                width: safeSize * scale,
                height: safeSize * scale,
                borderRadius: (safeSize * scale) / 2,
                borderColor: 'rgba(255,255,255,0.03)',
              },
            ]}
          />
        ))}
        
        {/* Realistic shine effect */}
        <View
          style={[
            styles.shine,
            {
              width: safeSize * 0.5,
              height: safeSize * 1.5,
              top: -safeSize * 0.25,
              left: safeSize * 0.25,
              borderRadius: safeSize * 0.25,
              opacity: 0.15,
            },
          ]}
        />
        
        {/* Center Label */}
        <View
          style={[
            styles.label,
            {
              width: labelSize,
              height: labelSize,
              borderRadius: labelSize / 2,
              backgroundColor: LABEL_COLOR,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.1)',
            },
          ]}
        >
          {/* Label decoration */}
          <View style={[styles.labelInnerRing, { width: labelSize * 0.85, height: labelSize * 0.85, borderRadius: (labelSize * 0.85) / 2, borderColor: LABEL_ACCENT, borderWidth: 0.5, opacity: 0.4 }]} />
          
          {/* Label text lines simulation */}
          <View style={[styles.labelLine, { width: labelSize * 0.4, height: 1.5, backgroundColor: '#333', marginBottom: 3, opacity: 0.8 }]} />
          <View style={[styles.labelLine, { width: labelSize * 0.25, height: 1, backgroundColor: '#666', opacity: 0.6 }]} />
        </View>
        
        {/* Center Hole */}
        <View
          style={[
            styles.hole,
            {
              width: holeSize,
              height: holeSize,
              borderRadius: holeSize / 2,
              backgroundColor: '#010101',
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disk: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.40,
    shadowRadius: 8,
    elevation: 12,
  },
  vinylSurface: {
    position: 'absolute',
  },
  grooveRing: {
    position: 'absolute',
    borderWidth: 0.5,
  },
  shine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.15)',
    transform: [{ rotate: '-25deg' }],
  },
  label: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  labelInnerRing: {
    position: 'absolute',
  },
  labelLine: {
    borderRadius: 1,
  },
  hole: {
    backgroundColor: '#0a0a0a', // Very dark hole
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 1,
  },
});
