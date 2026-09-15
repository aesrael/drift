import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, ActivityIndicator, Image,
  Dimensions, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { Playlist, Album, Artist, Genre } from '../types';
import {
  getPlaylists, createPlaylist, deletePlaylist,
  getAlbumList, getGenres, getArtists, getCoverArtUrl, search3,
} from '../services/subsonic';
import { Header } from '../components';

const { width } = Dimensions.get('window');
const ALBUM_COLS = 2;
const ALBUM_ITEM_WIDTH = (width - SPACING.md * 3) / ALBUM_COLS;
const PAGE_SIZE = 20;
const VIRTUAL_PAGE = 40; // rows revealed per scroll-end for server-fetched-all lists
const ARTIST_PAGE = 100; // artists fetched per page — server handles chunking

const TABS = ['Playlists', 'Albums', 'Artists', 'Genres'] as const;
type Tab = typeof TABS[number];

const PLAYLIST_GRADIENTS: readonly [string, string][] = [
  ['#e74c3c', '#c0392b'],
  ['#c17d5c', '#e8b89a'],
  ['#a8d5ba', '#6ba5a7'],
  ['#c17d9f', '#7b68a6'],
  ['#667eea', '#764ba2'],
  ['#2193b0', '#6dd5ed'],
];

// ─── Sub-components ────────────────────────────────────────────────────────

function PlaylistItem({ playlist, index, onPress }: { playlist: Playlist; index: number; onPress: () => void }) {
  const colors = useThemeColors();
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);
  const gradient = PLAYLIST_GRADIENTS[index % PLAYLIST_GRADIENTS.length];

  React.useEffect(() => {
    if (playlist.coverArt) {
      const cacheBust = playlist.changed || playlist.created;
      getCoverArtUrl(playlist.coverArt, 120, cacheBust).then(setCoverUrl).catch(() => null);
    }
  }, [playlist.coverArt, playlist.changed, playlist.created]);

  return (
    <TouchableOpacity style={[styles.playlistRow, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.playlistRowArt, { backgroundColor: gradient[0] }]}>
        {coverUrl
          ? <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} />
          : <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.7)" />
        }
      </View>
      <View style={styles.playlistRowInfo}>
        <Text style={[styles.playlistRowName, { color: colors.text }]} numberOfLines={1}>{playlist.name}</Text>
        <Text style={[styles.playlistRowSub, { color: colors.textMuted }]}>{playlist.songCount} songs</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function AlbumGridItem({ album, onPress }: { album: Album; onPress: () => void }) {
  const colors = useThemeColors();
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (album.coverArt) {
      getCoverArtUrl(album.coverArt, 300).then(setCoverUrl).catch(() => null);
    }
  }, [album.coverArt]);

  return (
    <TouchableOpacity style={[styles.albumItem, { width: ALBUM_ITEM_WIDTH }]} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.albumCover, { backgroundColor: colors.surfaceLight }]}>
        {coverUrl
          ? <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Ionicons name="disc-outline" size={36} color={colors.textMuted} />
        }
      </View>
      <Text style={[styles.albumName, { color: colors.text }]} numberOfLines={1}>{album.name}</Text>
      <Text style={[styles.albumArtist, { color: colors.textMuted }]} numberOfLines={1}>{album.artist}</Text>
    </TouchableOpacity>
  );
}

function ArtistRow({ artist, onPress }: { artist: Artist; onPress: () => void }) {
  const colors = useThemeColors();
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (artist.coverArt) {
      getCoverArtUrl(artist.coverArt, 120).then(setCoverUrl).catch(() => null);
    }
  }, [artist.coverArt]);

  return (
    <TouchableOpacity style={[styles.artistRow, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.artistAvatar, { backgroundColor: colors.surfaceLight }]}>
        {coverUrl
          ? <Image source={{ uri: coverUrl }} style={[StyleSheet.absoluteFill, { borderRadius: 24 }]} />
          : <Text style={[styles.artistInitial, { color: colors.primary }]}>{artist.name[0]?.toUpperCase()}</Text>
        }
      </View>
      <View style={styles.artistInfo}>
        <Text style={[styles.artistName, { color: colors.text }]} numberOfLines={1}>{artist.name}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function GenreRow({ genre, onPress }: { genre: Genre; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity style={[styles.genreRow, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.genreIcon, { backgroundColor: `${colors.primary}22` }]}>
        <Text style={[styles.genreInitial, { color: colors.primary }]}>{genre.name[0]?.toUpperCase()}</Text>
      </View>
      <View style={styles.genreInfo}>
        <Text style={[styles.genreName, { color: colors.text }]} numberOfLines={1}>{genre.name}</Text>
        <Text style={[styles.genreSub, { color: colors.textMuted }]}>{genre.songCount} songs</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────

export function PlaylistsScreen({ navigation }: any) {
  const colors = useThemeColors();

  const [activeTab, setActiveTab] = useState<Tab>('Playlists');
  const [localQuery, setLocalQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // Playlists state
  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [chartPlaylists, setChartPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);

  // Albums state
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [albumsLoadingMore, setAlbumsLoadingMore] = useState(false);
  const [albumsHasMore, setAlbumsHasMore] = useState(true);

  // Artists state — real index with scroll-to-fetch
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistsLoadingMore, setArtistsLoadingMore] = useState(false);
  const [artistsHasMore, setArtistsHasMore] = useState(true);

  // Genres state (server returns all; use virtual window)
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genresLoading, setGenresLoading] = useState(false);
  const [genresVisible, setGenresVisible] = useState(VIRTUAL_PAGE);

  // Playlists virtual window
  const [playlistsVisible, setPlaylistsVisible] = useState(VIRTUAL_PAGE);

  // API search fallback state
  const [apiSearchResults, setApiSearchResults] = useState<{ albums: Album[]; artists: Artist[]; playlists: Playlist[]; genres: Genre[] } | null>(null);
  const [apiSearching, setApiSearching] = useState(false);

  // Track which tabs have been loaded
  const loaded = useRef<Set<Tab>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTab = useCallback(async (tab: Tab, refresh = false) => {
    if (!refresh && loaded.current.has(tab)) return;

    if (tab === 'Playlists') {
      setPlaylistsLoading(true);
      try {
        const data = await getPlaylists();
        setChartPlaylists(data.filter(p => p.isChart));
        setUserPlaylists(data.filter(p => !p.isChart));
        setPlaylistsVisible(VIRTUAL_PAGE);
        loaded.current.add('Playlists');
      } catch (e) { console.error(e); }
      finally { setPlaylistsLoading(false); }

    } else if (tab === 'Albums') {
      setAlbumsLoading(true);
      try {
        const data = await getAlbumList('frequent', PAGE_SIZE, 0);
        setAlbums(data);
        setAlbumsHasMore(data.length === PAGE_SIZE);
        loaded.current.add('Albums');
      } catch (e) { console.error(e); }
      finally { setAlbumsLoading(false); }

    } else if (tab === 'Artists') {
      setArtistsLoading(true);
      try {
        const { artists: data, hasMore } = await getArtists(0, ARTIST_PAGE);
        setArtists(data);
        setArtistsHasMore(hasMore);
        loaded.current.add('Artists');
      } catch (e) { console.error(e); }
      finally { setArtistsLoading(false); }

    } else if (tab === 'Genres') {
      setGenresLoading(true);
      try {
        const data = await getGenres();
        setGenres(data);
        setGenresVisible(VIRTUAL_PAGE);
        loaded.current.add('Genres');
      } catch (e) { console.error(e); }
      finally { setGenresLoading(false); }
    }
  }, []);

  const loadMoreAlbums = useCallback(async () => {
    if (albumsLoadingMore || !albumsHasMore) return;
    setAlbumsLoadingMore(true);
    try {
      const data = await getAlbumList('frequent', PAGE_SIZE, albums.length);
      setAlbums(prev => [...prev, ...data]);
      setAlbumsHasMore(data.length === PAGE_SIZE);
    } catch (e) { console.error(e); }
    finally { setAlbumsLoadingMore(false); }
  }, [albumsLoadingMore, albumsHasMore, albums.length]);

  const loadMoreArtists = useCallback(async () => {
    if (artistsLoadingMore || !artistsHasMore) return;
    setArtistsLoadingMore(true);
    try {
      const { artists: data, hasMore } = await getArtists(artists.length, ARTIST_PAGE);
      setArtists(prev => [...prev, ...data]);
      setArtistsHasMore(hasMore);
    } catch (e) { console.error(e); }
    finally { setArtistsLoadingMore(false); }
  }, [artistsLoadingMore, artistsHasMore, artists.length]);



  // Load initial tab on focus
  useFocusEffect(useCallback(() => {
    loadTab(activeTab);
  }, [activeTab, loadTab]));

  const handleTabPress = (tab: Tab) => {
    setActiveTab(tab);
    setLocalQuery('');
    setApiSearchResults(null);
    loadTab(tab);
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadTab(activeTab, true);
    setIsRefreshing(false);
  }, [activeTab, loadTab]);



  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      await createPlaylist(newPlaylistName.trim());
      setShowCreateModal(false);
      setNewPlaylistName('');
      loaded.current.delete('Playlists');
      loadTab('Playlists', true);
    } catch {
      Alert.alert('Error', 'Failed to create playlist');
    }
  };

  const navigateToCollection = (type: 'album' | 'playlist' | 'genre', id: string, name: string, coverArt?: string) => {
    navigation.navigate('CollectionDetails', { type, id, name, coverArt });
  };

  const trimmedQuery = localQuery.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const hasLocalQuery = trimmedQuery.length > 0;
  const isFiltering = normalizedQuery.length >= 3;

  // Debounced API search fallback — fires when local results in any tab are empty
  useEffect(() => {
    if (normalizedQuery.length < 3) {
      setApiSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      const q = trimmedQuery;
      if (!q) return;
      const localCount =
        activeTab === 'Albums' ? filteredAlbums.length :
        activeTab === 'Artists' ? filteredArtists.length :
        activeTab === 'Playlists' ? filteredPlaylists.length :
        filteredGenres.length;
      if (localCount > 0) { setApiSearchResults(null); return; }
      setApiSearching(true);
      try {
        if (activeTab === 'Albums') {
          const r = await search3(q);
          setApiSearchResults({ albums: r.albums, artists: [], playlists: [], genres: [] });
        } else if (activeTab === 'Artists') {
          const { artists: a } = await getArtists(0, 50, q);
          setApiSearchResults({ albums: [], artists: a, playlists: [], genres: [] });
        } else if (activeTab === 'Playlists') {
          const pl = await getPlaylists(q);
          setApiSearchResults({ albums: [], artists: [], playlists: pl, genres: [] });
        } else if (activeTab === 'Genres') {
          const g = await getGenres(q);
          setApiSearchResults({ albums: [], artists: [], playlists: [], genres: g });
        }
      } catch { /* silent */ }
      finally { setApiSearching(false); }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedQuery, isFiltering, activeTab, trimmedQuery]);

  const filteredPlaylists = useMemo(() => {
    const all = [...userPlaylists, ...chartPlaylists];
    if (!isFiltering) return all;
    return all.filter((playlist) =>
      playlist.name.toLowerCase().includes(normalizedQuery)
    );
  }, [userPlaylists, chartPlaylists, isFiltering, normalizedQuery]);

  const filteredAlbums = useMemo(() => {
    if (!isFiltering) return albums;
    return albums.filter((album) =>
      album.name.toLowerCase().includes(normalizedQuery) ||
      album.artist.toLowerCase().includes(normalizedQuery)
    );
  }, [albums, isFiltering, normalizedQuery]);

  const filteredArtists = useMemo(() => {
    if (!isFiltering) return artists;
    return artists.filter((artist) => artist.name.toLowerCase().includes(normalizedQuery));
  }, [artists, isFiltering, normalizedQuery]);

  const filteredGenres = useMemo(() => {
    if (!isFiltering) return genres;
    return genres.filter((genre) => genre.name.toLowerCase().includes(normalizedQuery));
  }, [genres, isFiltering, normalizedQuery]);

  // Final data shown in each tab (local results OR api fallback)
  const displayAlbums = useMemo(() =>
    isFiltering && filteredAlbums.length === 0 && apiSearchResults ? apiSearchResults.albums : filteredAlbums,
  [isFiltering, filteredAlbums, apiSearchResults]);

  const displayArtists = useMemo(() =>
    isFiltering && filteredArtists.length === 0 && apiSearchResults ? apiSearchResults.artists : filteredArtists,
  [isFiltering, filteredArtists, apiSearchResults]);

  const displayPlaylists = useMemo(() => {
    const server = isFiltering && filteredPlaylists.length === 0 && apiSearchResults ? apiSearchResults.playlists : filteredPlaylists;
    return isFiltering ? server : server.slice(0, playlistsVisible);
  }, [filteredPlaylists, isFiltering, playlistsVisible, apiSearchResults]);

  const displayGenres = useMemo(() => {
    const server = isFiltering && filteredGenres.length === 0 && apiSearchResults ? apiSearchResults.genres : filteredGenres;
    return isFiltering ? server : server.slice(0, genresVisible);
  }, [filteredGenres, isFiltering, genresVisible, apiSearchResults]);

  const searchPlaceholder = `Search ${activeTab.toLowerCase()}...`;

  // ── Renderers ──

  const renderPlaylistsTab = () => {
    if (playlistsLoading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
    const hasMorePlaylists = !isFiltering && playlistsVisible < filteredPlaylists.length;
    return (
      <FlatList
        data={displayPlaylists}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <PlaylistItem
            playlist={item}
            index={index}
            onPress={() => navigateToCollection('playlist', item.id, item.name, item.coverArt)}
          />
        )}
        onEndReached={() => hasMorePlaylists && setPlaylistsVisible((v: number) => v + VIRTUAL_PAGE)}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListFooterComponent={hasMorePlaylists ? <ActivityIndicator style={styles.footerLoader} color={colors.primary} /> : null}
        ListEmptyComponent={
          isFiltering
            ? <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>No playlists found.</Text>
            : null
        }
      />
    );
  };

  const renderAlbumsTab = () => {
    if (albumsLoading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
    const isServerResults = isFiltering && filteredAlbums.length === 0 && (apiSearchResults?.albums.length ?? 0) > 0;
    return (
      <FlatList
        data={displayAlbums}
        keyExtractor={item => item.id}
        numColumns={ALBUM_COLS}
        columnWrapperStyle={styles.albumRow}
        renderItem={({ item }) => (
          <AlbumGridItem
            album={item}
            onPress={() => navigateToCollection('album', item.id, item.name, item.coverArt)}
          />
        )}
        onEndReached={isFiltering ? undefined : loadMoreAlbums}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={isServerResults ? (
          <Text style={[styles.serverResultsLabel, { color: colors.textMuted }]}>Server results</Text>
        ) : null}
        ListFooterComponent={
          albumsLoadingMore ? <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
          : apiSearching ? <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
          : null
        }
        ListEmptyComponent={
          isFiltering && !apiSearching
            ? <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>No albums found.</Text>
            : null
        }
      />
    );
  };

  const renderArtistsTab = () => {
    if (artistsLoading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
    const isServerResults = isFiltering && filteredArtists.length === 0 && (apiSearchResults?.artists.length ?? 0) > 0;
    return (
      <FlatList
        data={displayArtists}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ArtistRow
            artist={item}
            onPress={() => navigation.navigate('SeeAll', {
              title: item.name,
              kind: 'tracks',
              artistId: item.id,
            })}
          />
        )}
        onEndReached={isFiltering ? undefined : loadMoreArtists}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={isServerResults ? (
          <Text style={[styles.serverResultsLabel, { color: colors.textMuted }]}>Server results</Text>
        ) : null}
        ListFooterComponent={
          artistsLoadingMore ? <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
          : apiSearching ? <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
          : null
        }
        ListEmptyComponent={
          isFiltering && !apiSearching
            ? <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>No artists found.</Text>
            : null
        }
      />
    );
  };

  const renderGenresTab = () => {
    if (genresLoading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
    const hasMoreGenres = !isFiltering && genresVisible < filteredGenres.length;
    return (
      <FlatList
        data={displayGenres}
        keyExtractor={(item, i) => item.name + i}
        renderItem={({ item }) => (
          <GenreRow
            genre={item}
            onPress={() => navigateToCollection('genre', item.name, item.name)}
          />
        )}
        onEndReached={() => hasMoreGenres && setGenresVisible((v: number) => v + VIRTUAL_PAGE)}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListFooterComponent={hasMoreGenres ? <ActivityIndicator style={styles.footerLoader} color={colors.primary} /> : null}
        ListEmptyComponent={
          isFiltering
            ? <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>No genres found.</Text>
            : null
        }
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Library"
        rightAction={
          <TouchableOpacity onPress={() => navigation.navigate('Search')} style={styles.headerBtn}>
            <Ionicons name="search-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        }
      />

      {/* Top tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={styles.tabItem}
            onPress={() => handleTabPress(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, { color: activeTab === tab ? colors.primary : colors.textMuted }]}>
              {tab}
            </Text>
            {activeTab === tab && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.localSearchWrap}>
        <View style={[styles.localSearchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.localSearchInput, { color: colors.text }]}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            value={localQuery}
            onChangeText={setLocalQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {hasLocalQuery && (
            <TouchableOpacity onPress={() => setLocalQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {hasLocalQuery && !isFiltering && (
          <Text style={[styles.searchHintText, { color: colors.textMuted }]}>Type at least 3 characters to search.</Text>
        )}
      </View>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {activeTab === 'Playlists' && (
          <>
            <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.createButtonText, { color: colors.primary }]}>New Playlist</Text>
            </TouchableOpacity>
            {renderPlaylistsTab()}
          </>
        )}
        {activeTab === 'Albums' && renderAlbumsTab()}
        {activeTab === 'Artists' && renderArtistsTab()}
        {activeTab === 'Genres' && renderGenresTab()}
      </View>

      {/* Create Playlist Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Playlist</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="Playlist name"
              placeholderTextColor={colors.textMuted}
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
                onPress={() => { setShowCreateModal(false); setNewPlaylistName(''); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreatePlaylist}
              >
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBtn: { padding: SPACING.xs },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: SPACING.md,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    position: 'relative',
  },
  tabLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '10%',
    right: '10%',
    height: 2,
    borderRadius: 2,
  },

  tabContent: { flex: 1 },
  localSearchWrap: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  localSearchBox: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  localSearchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    paddingVertical: 0,
  },
  searchHintText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xs,
  },

  // Create button
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  createButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },

  // List
  listContent: { paddingBottom: 160 },
  loader: { marginTop: 60 },
  footerLoader: { paddingVertical: SPACING.md },
  emptySearchText: {
    textAlign: 'center',
    marginTop: SPACING.xl,
    fontSize: FONT_SIZES.sm,
  },

  // Playlist row
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playlistRowArt: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  playlistRowInfo: { flex: 1 },
  playlistRowName: { fontSize: FONT_SIZES.md, fontWeight: '600', marginBottom: 2 },
  playlistRowSub: { fontSize: FONT_SIZES.xs },

  // Album grid
  albumRow: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  albumItem: { gap: SPACING.xs },
  albumCover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  albumName: { fontSize: FONT_SIZES.sm, fontWeight: '600', marginTop: SPACING.xs },
  albumArtist: { fontSize: FONT_SIZES.xs },

  // Artist row
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  artistAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  artistInitial: { fontSize: FONT_SIZES.xl, fontWeight: '700' },
  artistInfo: { flex: 1 },
  artistName: { fontSize: FONT_SIZES.md, fontWeight: '600', marginBottom: 2 },
  artistSub: { fontSize: FONT_SIZES.xs },

  // Genre row
  genreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  genreIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  genreInitial: { fontSize: FONT_SIZES.lg, fontWeight: '700' },
  genreInfo: { flex: 1 },
  genreName: { fontSize: FONT_SIZES.md, fontWeight: '600', marginBottom: 2 },
  genreSub: { fontSize: FONT_SIZES.xs },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 16,
    padding: SPACING.lg,
    width: '80%',
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  modalInput: {
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  modalButtons: { flexDirection: 'row', gap: SPACING.sm },
  modalBtn: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnText: { fontWeight: '600', fontSize: FONT_SIZES.md },
  serverResultsLabel: {
    fontSize: FONT_SIZES.xs,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    fontStyle: 'italic',
  },
});
