import { NativeModules, Platform } from 'react-native';
// We strictly use require() for CarPlay to avoid crashing on import if the native module is missing.
import { getPlaylists, getPlaylist, getArtists, getAlbum, getAlbums, getRandomSongs, getTopSongs, getAuthQueryParams, getCoverArtUrl, search3 } from '../services/subsonic';
import { getDriftRadioRecommendation } from '../services/recommendations';
import { Track } from '../types';

interface PlayerControls {
  play: (track: Track, queue: Track[]) => void;
  setAutoQueueEnabled: (enabled: boolean) => void;
}

class CarManager {
  private isConnected = false;
  private playerControls: PlayerControls | null = null;
  private carPlay: any = null;
  private ListTemplate: any = null;
  private initialized = false;

  constructor() {}

  public init() {
    if (this.initialized) return;
    this.initialized = true;
    this.setupListeners();
  }

  public setPlayerControls(controls: PlayerControls) {
    this.playerControls = controls;
  }

  private setupListeners() {
    if (Platform.OS !== 'ios') {
      return;
    }

    // Safety check: verify if CarPlay native module is effectively linked
    if (!NativeModules.RNCarPlay) {
       console.warn('CarPlay native module not found. Skipping initialization.');
       return;
    }

    try {
      // Lazy load CarPlay classes only if native module exists
      const { CarPlay, ListTemplate } = require('react-native-carplay');
      this.carPlay = CarPlay;
      this.ListTemplate = ListTemplate;
      
      if (this.carPlay) {
        this.carPlay.registerOnConnect(this.onConnect);
        this.carPlay.registerOnDisconnect(this.onDisconnect);
      }
    } catch (error) {
       console.warn('CarPlay native module not found or failed to initialize.', error);
    }
  }

  private onConnect = (window: any) => {
    console.log('CarPlay/Android Auto Connected');
    this.isConnected = true;
    this.renderRootTemplate();
  };

  private onDisconnect = () => {
    console.log('CarPlay/Android Auto Disconnected');
    this.isConnected = false;
  };

  private async renderRootTemplate() {
    if (!this.carPlay || !this.ListTemplate) return;

    const sections = [
      {
        header: 'QuickPlay',
        items: [
          { text: 'Free Play', detailText: 'Your personalized station', id: 'free_play' },
          { text: 'Search', detailText: 'Find tracks, albums, artists', id: 'search' },
          { text: 'Top Songs', detailText: 'Your starred tracks', id: 'top_songs' },
          { text: 'Random Mix', detailText: 'Shuffle your library', id: 'random' },
        ],
      },
      {
        header: 'Library',
        items: [
          { text: 'Playlists', id: 'playlists' },
           { text: 'Charts', id: 'charts' },
          { text: 'Artists', id: 'artists' },
          { text: 'Albums', id: 'albums' },
        ],
      },
    ];

    const rootTemplate = new this.ListTemplate({
      title: 'Drift',
      headerAction: { type: 'appIcon' },
      sections: sections,
      onItemSelect: async ({ index }: { index: number }) => {
        // Flatten items to find the selected one by absolute index
        const flatItems = sections.flatMap(section => section.items);
        const item = flatItems[index];
        
        if (!item) return;
        
        switch (item.id) {
          case 'free_play':
            this.playDriftRadio();
            break;
          case 'search':
            this.showSearch();
            break;
          case 'top_songs':
            this.playTopSongs();
            break;
          case 'random':
            this.playRandomMix();
            break;
          case 'playlists':
            this.showPlaylists(false); // Show user playlists
            break;
          case 'charts':
            this.showPlaylists(true); // Show charts
            break;
          case 'artists':
            this.showArtists();
            break;
          case 'albums':
            this.showAlbums();
            break;
        }
      },
    });

    this.carPlay.setRootTemplate(rootTemplate);
  }

  private async showPlaylists(isChart: boolean) {
    if (!this.carPlay || !this.ListTemplate) return;
    try {
      const allPlaylists = await getPlaylists();
      const filteredPlaylists = allPlaylists.filter(p => !!p.isChart === isChart);
      const { serverUrl, query } = await getAuthQueryParams();
      
      const items = filteredPlaylists.map(p => {
          let imageUrl = undefined;
          
          if (p.coverArt) {
             imageUrl = `${serverUrl}/rest/getCoverArt.view?id=${p.coverArt}&${query}&size=100`;
          }
          
          return {
            text: p.name,
            detailText: `${p.songCount} songs`,
            id: p.id,
            image: imageUrl ? { uri: imageUrl } : undefined,
          };
      });

      const template = new this.ListTemplate({
        title: isChart ? 'Charts' : 'Playlists',
        sections: [{ items }],
        onItemSelect: async ({ index }: { index: number }) => {
          const playlist = filteredPlaylists[index];
          this.showPlaylistTracks(playlist.id, playlist.name);
        },
      });
      this.carPlay.pushTemplate(template);
    } catch (e) {
      console.error('Failed to load playlists', e);
    }
  }

  private shuffleTracks(tracks: Track[]): Track[] {
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private async showPlaylistTracks(id: string, name: string) {
    if (!this.carPlay || !this.ListTemplate) return;
    try {
      const playlist = await getPlaylist(id);
      const tracks = playlist.entry || [];
      const { serverUrl, query } = await getAuthQueryParams();

      const shuffleItem = {
        text: '🔀 Shuffle',
        detailText: `Play ${tracks.length} songs in random order`,
        id: '__shuffle__',
        image: undefined,
      };

      const trackItems = tracks.map(t => {
        let imageUrl = undefined;
        if (t.coverArt) {
          imageUrl = `${serverUrl}/rest/getCoverArt.view?id=${t.coverArt}&${query}&size=100`;
        }
        return {
          text: t.title,
          detailText: t.artist,
          id: t.id,
          image: imageUrl ? { uri: imageUrl } : undefined,
        };
      });

      const allItems = [shuffleItem, ...trackItems];

      const template = new this.ListTemplate({
        title: name,
        sections: [{ items: allItems }],
        onItemSelect: async ({ index }: { index: number }) => {
          if (!this.playerControls) return;
          if (index === 0) {
            // Shuffle all tracks
            const shuffled = this.shuffleTracks(tracks);
            this.playerControls.play(shuffled[0], shuffled);
          } else {
            // Play from selected track
            const track = tracks[index - 1];
            this.playerControls.play(track, tracks);
          }
          this.playerControls.setAutoQueueEnabled(false);
          this.carPlay.popTemplate();
        },
      });
      this.carPlay.pushTemplate(template);
    } catch (e) {
      console.error('Failed to load playlist tracks', e);
    }
  }

  private async showArtists() {
    if (!this.carPlay || !this.ListTemplate) return;
    try {
      const { artists } = await getArtists();
      const template = new this.ListTemplate({
        title: 'Artists',
        sections: [{
          items: artists.map(a => ({
            text: a.name,
            id: a.id,
          })),
        }],
        onItemSelect: async ({ index }: { index: number }) => {
           // Placeholder
        },
      });
      this.carPlay.pushTemplate(template);
    } catch (e) {
      console.error('Failed to load artists', e);
    }
  }

  private async showAlbums() {
    if (!this.carPlay || !this.ListTemplate) return;
    try {
      const albums = await getAlbums();
      const { serverUrl, query } = await getAuthQueryParams();
      
      const items = albums.map(a => {
          let imageUrl = undefined;
          if (a.coverArt) {
             imageUrl = `${serverUrl}/rest/getCoverArt.view?id=${a.coverArt}&${query}&size=100`;
          }

          return {
            text: a.name,
            detailText: a.artist,
            id: a.id,
            image: imageUrl ? { uri: imageUrl } : undefined,
          };
      });

      const template = new this.ListTemplate({
        title: 'Albums',
        sections: [{ items }],
        onItemSelect: async ({ index }: { index: number }) => {
            const album = albums[index];
            this.showAlbumTracks(album.id, album.name);
        },
      });
      this.carPlay.pushTemplate(template);
    } catch (e) {
        console.error('Failed to load albums', e);
    }
  }

  private async showAlbumTracks(id: string, name: string) {
      if (!this.carPlay || !this.ListTemplate) return;
      try {
          const { tracks } = await getAlbum(id);
          const { serverUrl, query } = await getAuthQueryParams();
          
          const items = tracks.map(t => {
              let imageUrl = undefined;
              if (t.coverArt) {
                 imageUrl = `${serverUrl}/rest/getCoverArt.view?id=${t.coverArt}&${query}&size=100`;
              }
    
              return {
                text: t.title,
                detailText: t.artist,
                id: t.id,
                image: imageUrl ? { uri: imageUrl } : undefined,
              };
          });

          const template = new this.ListTemplate({
              title: name,
              sections: [{ items }],
              onItemSelect: async ({ index }: { index: number }) => {
                  const track = tracks[index];
                  if (this.playerControls) {
                      this.playerControls.play(track, tracks);
                      this.playerControls.setAutoQueueEnabled(false);
                      this.carPlay.popTemplate();
                  }
              },
          });
          this.carPlay.pushTemplate(template);
      } catch (e) {
          console.error('Failed to load album tracks', e);
      }
  }

  private async playRandomMix() {
    try {
      const tracks = await getRandomSongs(20);
      if (tracks.length > 0 && this.playerControls) {
        this.playerControls.play(tracks[0], tracks);
        this.playerControls.setAutoQueueEnabled(false);
      }
    } catch (e) {
      console.error('Failed to play random mix', e);
    }
  }

  private async playTopSongs() {
    try {
      const tracks = await getTopSongs(50); // Get top 50 most played songs
      if (tracks.length > 0 && this.playerControls) {
        this.playerControls.play(tracks[0], tracks);
        this.playerControls.setAutoQueueEnabled(false);
      }
    } catch (e) {
      console.error('Failed to play top songs', e);
    }
  }

  private async playDriftRadio() {
    try {
      const recommendations = await getDriftRadioRecommendation();
      const tracks = recommendations.length > 0 ? recommendations : await getRandomSongs(20);
      
      if (tracks.length > 0 && this.playerControls) {
        this.playerControls.play(tracks[0], tracks);
        this.playerControls.setAutoQueueEnabled(true);
      }
    } catch (e) {
       console.error('Failed to play drift radio', e);
       this.playRandomMix(); // Fallback
    }
  }

  private async showSearch() {
    if (!this.carPlay || !this.ListTemplate) return;
    
    // Android Auto has limited text input, so we provide quick search options
    const quickSearches = [
      { text: 'Afrobeats', query: 'afrobeats', detailText: 'Popular Afrobeats tracks' },
      { text: 'Ayra Starr', query: 'ayra starr', detailText: 'Search by artist' },
      { text: 'Wizkid', query: 'wizkid', detailText: 'Search by artist' },
      { text: 'Tyla', query: 'tyla', detailText: 'Search by artist' },
      { text: 'Davido', query: 'davido', detailText: 'Search by artist' },
      { text: 'Burna Boy', query: 'burna boy', detailText: 'Search by artist' },
      { text: 'Asake', query: 'asake', detailText: 'Search by artist' },
      { text: 'Rema', query: 'rema', detailText: 'Search by artist' },
    ];

    const template = new this.ListTemplate({
      title: 'Quick Search',
      sections: [{
        header: 'Popular Searches',
        items: quickSearches,
      }],
      onItemSelect: async ({ index }: { index: number }) => {
        const search = quickSearches[index];
        this.performSearch(search.query);
      },
    });

    this.carPlay.pushTemplate(template);
  }

  private async performSearch(query: string) {
    if (!this.carPlay || !this.ListTemplate) return;
    
    try {
      const results = await search3(query);
      const { serverUrl, query: authQuery } = await getAuthQueryParams();
      
      if (results.tracks.length === 0) {
        console.log('No results found for:', query);
        return;
      }

      const items = results.tracks.map(t => {
        let imageUrl = undefined;
        if (t.coverArt) {
          imageUrl = `${serverUrl}/rest/getCoverArt.view?id=${t.coverArt}&${authQuery}&size=100`;
        }

        return {
          text: t.title,
          detailText: t.artist,
          id: t.id,
          image: imageUrl ? { uri: imageUrl } : undefined,
        };
      });

      const template = new this.ListTemplate({
        title: `Results: ${query}`,
        sections: [{ items }],
        onItemSelect: async ({ index }: { index: number }) => {
          const track = results.tracks[index];
          if (this.playerControls) {
            this.playerControls.play(track, results.tracks);
            this.playerControls.setAutoQueueEnabled(false);
            this.carPlay.popTemplate();
          }
        },
      });

      this.carPlay.pushTemplate(template);
    } catch (e) {
      console.error('Search failed', e);
    }
  }
}

let carManagerInstance: CarManager | null = null;

export function initCarManager(): CarManager | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  if (!NativeModules.RNCarPlay) {
    return null;
  }
  if (!carManagerInstance) {
    carManagerInstance = new CarManager();
  }
  carManagerInstance.init();
  return carManagerInstance;
}
