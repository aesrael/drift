import React from 'react';
import { FlatList, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { Track } from '../types';
import { AlbumCardWithCover } from './AlbumCardWithCover';

interface TrackHorizontalListProps {
  tracks: Track[];
  onTrackPress: (track: Track) => void;
  itemWidth?: number;
  itemSpacing?: number;
}

export function TrackHorizontalList({
  tracks,
  onTrackPress,
  itemWidth = 180,
  itemSpacing = SPACING.sm,
}: TrackHorizontalListProps) {
  return (
    <FlatList
      horizontal
      data={tracks}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: SPACING.md }}
      renderItem={({ item }) => (
        <View style={{ width: itemWidth, marginRight: itemSpacing }}>
          <AlbumCardWithCover
            name={item.title || 'Unknown Track'}
            artist={item.artist || 'Unknown Artist'}
            coverArtId={(() => {
              // Robust fallback logic matching TrackItem:
              // Prefer albumId if coverArt is missing or temp
              let cid = item.coverArt;
              if ((!cid || cid.startsWith('temp-')) && item.albumId && !item.albumId.startsWith('temp-')) {
                 cid = item.albumId;
              }
              return cid || item.albumId || item.id;
            })()}
            onPress={() => onTrackPress(item)}
            style={{ width: '100%' }}
          />
        </View>
      )}
    />
  );
}
