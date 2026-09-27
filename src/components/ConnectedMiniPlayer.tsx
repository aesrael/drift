import React from 'react';
import { ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useProgress } from 'react-native-track-player';
import { usePlayer } from '../context/PlayerContext';
import { MiniPlayer } from './MiniPlayer';
import { getCoverArtUrl } from '../services/subsonic';

interface ConnectedMiniPlayerProps {
  style?: ViewStyle;
  nowPlayingParent?: string;
}

export function ConnectedMiniPlayer({ style, nowPlayingParent }: ConnectedMiniPlayerProps) {
  const navigation = useNavigation<any>();
  const progress = useProgress(500); 
  const position = progress.position * 1000;
  const duration = progress.duration * 1000;
  const { currentTrack, queue, isPlaying, isLoading, pause, resume, next, previous, toggleHeart, isHearted, purgeTrack } = usePlayer();
  const lastTrackRef = React.useRef<typeof currentTrack>(null);
  const [coverUrl, setCoverUrl] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (currentTrack) {
      lastTrackRef.current = currentTrack;
    }
  }, [currentTrack]);

  const displayTrack = currentTrack ?? lastTrackRef.current;

  React.useEffect(() => {
    if (displayTrack?.coverArt) {
      getCoverArtUrl(displayTrack.coverArt, 100).then(setCoverUrl);
    } else {
      setCoverUrl(undefined);
    }
  }, [displayTrack?.id, displayTrack?.coverArt]);

  if (!displayTrack) return null;

  const currentIndex = queue.findIndex(t => t.id === displayTrack.id);
  const canSkipPrevious = currentIndex > 0;
  const canSkipNext = currentIndex >= 0 && currentIndex < queue.length - 1;

  return (
    <MiniPlayer
      track={displayTrack}
      isPlaying={isPlaying}
      progress={duration > 0 ? position / duration : 0}
      onPlayPause={() => {
        if (isPlaying) {
          pause();
        } else {
          resume();
        }
      }}
      onPress={() => {
        if (nowPlayingParent) {
          navigation.navigate(nowPlayingParent, { screen: 'NowPlaying' });
          return;
        }
        const routeNames = navigation.getState()?.routeNames ?? [];
        const parent = routeNames.includes('Local') ? 'Local' : 'Home';
        navigation.navigate(parent, { screen: 'NowPlaying' });
      }}
      onHeart={() => displayTrack && toggleHeart(displayTrack)}
      onPurge={() => displayTrack && purgeTrack(displayTrack)}
      onNext={next}
      onPrevious={previous}
      canSkipNext={canSkipNext}
      canSkipPrevious={canSkipPrevious}
      isHearted={isHearted(displayTrack.id)}
      isLoading={isLoading}
      coverUrl={coverUrl}
      style={style}
    />
  );
}
