import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { Album } from '../types';
import { AlbumCardWithCover } from './AlbumCardWithCover';

interface AlbumHorizontalListProps {
  albums: Album[];
  onAlbumPress: (album: Album) => void;
  itemWidth?: number;
  itemSpacing?: number;
}

export function AlbumHorizontalList({
  albums,
  onAlbumPress,
  itemWidth = 180,
  itemSpacing = SPACING.sm,
}: AlbumHorizontalListProps) {
  return (
    <FlatList
      horizontal
      data={albums}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={{ width: itemWidth, marginRight: itemSpacing }}>
          <AlbumCardWithCover
            name={item.name || 'Unknown Album'}
            artist={item.artist}
            coverArtId={item.coverArt}
            songCount={item.songCount}
            duration={item.duration}
            onPress={() => onAlbumPress(item)}
            style={{ width: '100%' }}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: SPACING.md,
  },
});
