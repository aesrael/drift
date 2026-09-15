import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { AlbumCard } from './AlbumCard';
import { getCoverArtUrl } from '../services/subsonic';

interface AlbumCardWithCoverProps {
  name: string;
  artist: string;
  coverArtId?: string;
  songCount?: number;
  duration?: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function AlbumCardWithCover({ name, artist, coverArtId, songCount, duration, onPress, style }: AlbumCardWithCoverProps) {
  const [coverUrl, setCoverUrl] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    // Robust fallback: coverArtId -> albumId -> id, preferring albumId if coverArt is temp/broken
    // Note: The parent component (TrackHorizontalList) passes: item.coverArt || item.albumId || item.id
    // But if that first one is 'temp-', we might WANT to check others.
    // However, AlbumCardWithCover receives a SINGLE 'coverArtId' string.
    // So distinct fallback logic should happen in the PARENT (TrackHorizontalList).
    
    if (coverArtId) {
      getCoverArtUrl(coverArtId, 300)
        .then(url => {
          setCoverUrl(url);
        })
        .catch(err => {
          console.error(`[AlbumCard] Failed to get cover URL for ${coverArtId}:`, err);
          setCoverUrl(undefined);
        });
    }
  }, [coverArtId, name]);

  return (
    <AlbumCard 
      name={name} 
      artist={artist}
      coverArt={coverUrl}
      songCount={songCount}
      duration={duration}
      onPress={onPress}
      style={style}
    />
  );
}
