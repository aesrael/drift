package com.drift.app.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.Album
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.drift.app.data.rememberQuery
import com.drift.app.di.AppGraph
import com.drift.app.model.*
import com.drift.app.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val TABS = listOf("Playlists", "Albums", "Artists", "Genres")
private const val ALBUM_PAGE = 20
private const val VIRTUAL_PAGE = 40
private const val ARTIST_PAGE = 100
private val PLAYLIST_GRADIENTS = listOf(
    Color(0xFFE74C3C) to Color(0xFFC0392B), Color(0xFFC17D5C) to Color(0xFFE8B89A), Color(0xFFA8D5BA) to Color(0xFF6BA5A7),
    Color(0xFFC17D9F) to Color(0xFF7B68A6), Color(0xFF667EEA) to Color(0xFF764BA2), Color(0xFF2193B0) to Color(0xFF6DD5ED),
)

/** screens/PlaylistsScreen.tsx */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen() {
    val g = AppGraph
    val c = Drift.colors
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(TABS[0]) }
    var query by rememberSaveable { mutableStateOf("") }
    var showCreate by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    val epoch by g.cache.epoch.collectAsState()

    val q = query.trim()
    val filtering = q.length >= 3

    // ---- data -------------------------------------------------------------------------------------------------------
    val playlistsQ = rememberQuery(g.cache, "playlists") { g.router.playlists() }
    val artistsQ = rememberQuery(g.cache, "artists") { g.router.artists() }
    val genresQ = rememberQuery(g.cache, "genres") { g.router.genres() }

    // Albums: 'frequent' pages of 20 (falls back to A–Z when there is no play history yet, e.g. a fresh device library).
    var albums by remember { mutableStateOf<List<Album>>(emptyList()) }
    var albumsLoading by remember { mutableStateOf(true) }
    var albumsMore by remember { mutableStateOf(false) }
    var albumsLoadingMore by remember { mutableStateOf(false) }
    var albumType by remember { mutableStateOf(AlbumListType.Frequent) }
    suspend fun loadAlbums() {
        albumsLoading = true
        try {
            var type = AlbumListType.Frequent
            var first = g.router.albumList(type, ALBUM_PAGE, 0)
            if (first.isEmpty()) { type = AlbumListType.ByName; first = g.router.albumList(type, ALBUM_PAGE, 0) }
            albumType = type; albums = first; albumsMore = first.size == ALBUM_PAGE
        } catch (_: Exception) { }
        albumsLoading = false
    }
    LaunchedEffect(epoch) { loadAlbums() }
    fun loadMoreAlbums() {
        if (albumsLoadingMore || !albumsMore) return
        albumsLoadingMore = true
        scope.launch {
            try {
                val next = g.router.albumList(albumType, ALBUM_PAGE, albums.size)
                albums = albums + next; albumsMore = next.size == ALBUM_PAGE
            } catch (_: Exception) { }
            albumsLoadingMore = false
        }
    }

    var playlistsVisible by remember(tab) { mutableIntStateOf(VIRTUAL_PAGE) }
    var genresVisible by remember(tab) { mutableIntStateOf(VIRTUAL_PAGE) }
    var artistsVisible by remember(tab) { mutableIntStateOf(ARTIST_PAGE) }

    // Server-search fallback (500 ms debounce) when the local filter has no hits.
    var apiAlbums by remember { mutableStateOf<List<Album>?>(null) }
    var apiArtists by remember { mutableStateOf<List<Artist>?>(null) }
    var apiSearching by remember { mutableStateOf(false) }
    val needle = q.lowercase()
    val fAlbums = if (filtering) albums.filter { it.name.lowercase().contains(needle) || it.artist.lowercase().contains(needle) } else albums
    val fArtists = artistsQ.data.orEmpty().let { l -> if (filtering) l.filter { it.name.lowercase().contains(needle) } else l }
    val fPlaylists = playlistsQ.data.orEmpty().let { l -> if (filtering) l.filter { it.name.lowercase().contains(needle) } else l }
    val fGenres = genresQ.data.orEmpty().let { l -> if (filtering) l.filter { it.name.lowercase().contains(needle) } else l }
    LaunchedEffect(needle, tab, filtering) {
        apiAlbums = null; apiArtists = null
        if (!filtering || (tab != "Albums" && tab != "Artists")) return@LaunchedEffect
        if ((tab == "Albums" && fAlbums.isNotEmpty()) || (tab == "Artists" && fArtists.isNotEmpty())) return@LaunchedEffect
        delay(500)
        apiSearching = true
        runCatching { g.router.search(q) }.onSuccess { r -> if (tab == "Albums") apiAlbums = r.albums else apiArtists = r.artists }
        apiSearching = false
    }

    Column(Modifier.fillMaxSize().background(c.background)) {
        Header("Library") {
            Icon(Icons.Outlined.Search, "Search", Modifier.padding(Spacing.xs).size(22.dp).tap { nav.navigate(SearchRoute) }, tint = c.text)
        }
        // top tabs
        Row(Modifier.fillMaxWidth().drawBehindBorder(c.border).padding(horizontal = Spacing.md)) {
            TABS.forEach { t ->
                Box(Modifier.weight(1f).tap { tab = t; query = ""; apiAlbums = null; apiArtists = null }.padding(vertical = Spacing.sm), contentAlignment = Alignment.Center) {
                    Text(t, color = if (tab == t) c.primary else c.textMuted, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold)
                    if (tab == t) Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth(.8f).offset(y = Spacing.sm).height(2.dp).clip(RoundedCornerShape(2.dp)).background(c.primary))
                }
            }
        }
        // local search
        Column(Modifier.padding(start = Spacing.md, end = Spacing.md, top = Spacing.sm, bottom = Spacing.xs)) {
            Row(Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(10.dp)).background(c.surface).border(1.dp, c.border, RoundedCornerShape(10.dp)).padding(horizontal = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Icon(Icons.Outlined.Search, null, Modifier.size(16.dp), tint = c.textMuted)
                Box(Modifier.weight(1f)) {
                    if (query.isEmpty()) Text("Search ${tab.lowercase()}...", color = c.textMuted, fontSize = Fonts.sm)
                    BasicTextField(query, { query = it }, singleLine = true, textStyle = TextStyle(color = c.text, fontSize = Fonts.sm), cursorBrush = SolidColor(c.primary), modifier = Modifier.fillMaxWidth())
                }
                if (query.isNotEmpty()) Icon(Icons.Filled.Cancel, "Clear", Modifier.size(16.dp).tap { query = "" }, tint = c.textMuted)
            }
            if (query.trim().isNotEmpty() && !filtering) Text("Type at least 3 characters to search.", color = c.textMuted, fontSize = Fonts.xs, modifier = Modifier.padding(top = Spacing.xs))
        }

        PullToRefreshBox(isRefreshing = refreshing, onRefresh = {
            refreshing = true; g.cache.invalidate(); scope.launch { delay(400); refreshing = false }
        }, modifier = Modifier.weight(1f)) {
            when (tab) {
                "Playlists" -> Column(Modifier.fillMaxSize()) {
                    Row(Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm).tap { showCreate = true }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Icon(Icons.Outlined.AddCircleOutline, null, Modifier.size(18.dp), tint = c.primary)
                        Text("New Playlist", color = c.primary, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold)
                    }
                    if (playlistsQ.data == null && playlistsQ.loading) Loader(Modifier.padding(top = 60.dp))
                    else {
                        val shown = if (filtering) fPlaylists else fPlaylists.take(playlistsVisible)
                        val list = rememberLazyListState()
                        EndReached(list) { if (!filtering && playlistsVisible < fPlaylists.size) playlistsVisible += VIRTUAL_PAGE }
                        LazyColumn(state = list, contentPadding = PaddingValues(bottom = 160.dp)) {
                            itemsIndexed(shown, key = { _, p -> p.id }) { i, p -> PlaylistRow(p, i) { nav.navigate(CollectionRoute("playlist", p.id, p.name, p.coverArt)) } }
                            if (filtering && shown.isEmpty()) item { EmptySearch("No playlists found.") }
                        }
                    }
                }
                "Albums" -> if (albumsLoading && albums.isEmpty()) Loader(Modifier.padding(top = 60.dp)) else {
                    val serverResults = filtering && fAlbums.isEmpty() && !apiAlbums.isNullOrEmpty()
                    val shown = if (filtering && fAlbums.isEmpty()) apiAlbums.orEmpty() else fAlbums
                    val grid = androidx.compose.foundation.lazy.grid.rememberLazyGridState()
                    EndReachedGrid(grid) { if (!filtering) loadMoreAlbums() }
                    LazyVerticalGrid(GridCells.Fixed(2), state = grid, contentPadding = PaddingValues(start = Spacing.md, end = Spacing.md, bottom = 160.dp), horizontalArrangement = Arrangement.spacedBy(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.md), modifier = Modifier.fillMaxSize()) {
                        if (serverResults) item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) { ServerResultsLabel() }
                        itemsIndexed(shown, key = { i, a -> "${a.id}-$i" }) { _, a -> AlbumGridItem(a) { nav.navigate(CollectionRoute("album", a.id, a.name, a.coverArt)) } }
                        if (albumsLoadingMore || apiSearching) item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) { Loader(Modifier.padding(vertical = Spacing.md)) }
                        if (filtering && !apiSearching && shown.isEmpty()) item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) { EmptySearch("No albums found.") }
                    }
                }
                "Artists" -> if (artistsQ.data == null && artistsQ.loading) Loader(Modifier.padding(top = 60.dp)) else {
                    val serverResults = filtering && fArtists.isEmpty() && !apiArtists.isNullOrEmpty()
                    val base = if (filtering && fArtists.isEmpty()) apiArtists.orEmpty() else fArtists
                    val shown = if (filtering) base else base.take(artistsVisible)
                    val list = rememberLazyListState()
                    EndReached(list) { if (!filtering && artistsVisible < base.size) artistsVisible += ARTIST_PAGE }
                    LazyColumn(state = list, contentPadding = PaddingValues(bottom = 160.dp)) {
                        if (serverResults) item { ServerResultsLabel() }
                        itemsIndexed(shown, key = { i, a -> "${a.id}-$i" }) { _, a -> ArtistRow(a) { nav.navigate(SeeAllRoute(title = a.name, kind = "tracks", artistId = a.id)) } }
                        if (apiSearching) item { Loader(Modifier.padding(vertical = Spacing.md)) }
                        if (filtering && !apiSearching && shown.isEmpty()) item { EmptySearch("No artists found.") }
                    }
                }
                else -> if (genresQ.data == null && genresQ.loading) Loader(Modifier.padding(top = 60.dp)) else {
                    val shown = if (filtering) fGenres else fGenres.take(genresVisible)
                    val list = rememberLazyListState()
                    EndReached(list) { if (!filtering && genresVisible < fGenres.size) genresVisible += VIRTUAL_PAGE }
                    LazyColumn(state = list, contentPadding = PaddingValues(bottom = 160.dp)) {
                        itemsIndexed(shown, key = { i, gen -> gen.name + i }) { _, gen -> GenreRow(gen) { nav.navigate(CollectionRoute("genre", gen.name, gen.name)) } }
                        if (filtering && shown.isEmpty()) item { EmptySearch("No genres found.") }
                    }
                }
            }
        }
    }

    if (showCreate) {
        var name by remember { mutableStateOf("") }
        Dialog(onDismissRequest = { showCreate = false; name = "" }) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.background).padding(Spacing.lg)) {
                Text("New Playlist", color = c.text, fontSize = Fonts.xl, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Spacing.md))
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(c.surface).border(1.dp, c.border, RoundedCornerShape(8.dp)).padding(Spacing.md)) {
                    if (name.isEmpty()) Text("Playlist name", color = c.textMuted, fontSize = Fonts.md)
                    BasicTextField(name, { name = it }, singleLine = true, textStyle = TextStyle(color = c.text, fontSize = Fonts.md), cursorBrush = SolidColor(c.primary), modifier = Modifier.fillMaxWidth())
                }
                Spacer(Modifier.height(Spacing.md))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Box(Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(c.surface).tap { showCreate = false; name = "" }.padding(Spacing.md), contentAlignment = Alignment.Center) { Text("Cancel", color = c.textSecondary, fontWeight = FontWeight.SemiBold, fontSize = Fonts.md) }
                    Box(Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(c.primary).tap {
                        if (name.isNotBlank()) { g.actions.createPlaylist(name.trim()); showCreate = false; name = "" }
                    }.padding(Spacing.md), contentAlignment = Alignment.Center) { Text("Create", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = Fonts.md) }
                }
            }
        }
    }
}

// ---- rows (sub-components of the original screen) ------------------------------------------------------------------------

private fun Modifier.drawBehindBorder(color: Color) = this.drawBehind { drawLine(color, androidx.compose.ui.geometry.Offset(0f, size.height), androidx.compose.ui.geometry.Offset(size.width, size.height), 1.dp.toPx()) }

@Composable
private fun RowDivider() = Box(Modifier.fillMaxWidth().height(0.5.dp).background(Drift.colors.border))

@Composable
private fun PlaylistRow(p: Playlist, index: Int, onClick: () -> Unit) {
    val c = Drift.colors
    val grad = PLAYLIST_GRADIENTS[index % PLAYLIST_GRADIENTS.size]
    Column {
        Row(Modifier.fillMaxWidth().tap(onClick).padding(horizontal = Spacing.md, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            CoverImage(coverUrl(p.coverArt, 120), Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)).background(grad.first)) {
                Icon(Icons.Rounded.MusicNote, null, Modifier.size(20.dp), tint = Color.White.copy(alpha = .7f))
            }
            Column(Modifier.weight(1f).padding(horizontal = Spacing.md)) {
                Text(p.name, color = c.text, fontSize = Fonts.md, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(2.dp))
                Text("${p.songCount} songs", color = c.textMuted, fontSize = Fonts.xs)
            }
            Icon(Icons.Rounded.ChevronRight, null, Modifier.size(16.dp), tint = c.textMuted)
        }
        RowDivider()
    }
}

@Composable
private fun AlbumGridItem(album: Album, onClick: () -> Unit) {
    val c = Drift.colors
    Column(Modifier.fillMaxWidth().tap(onClick), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        CoverImage(coverUrl(album.coverArt, 300), Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(10.dp)).background(c.surfaceLight)) {
            Icon(Icons.Outlined.Album, null, Modifier.size(36.dp), tint = c.textMuted)
        }
        Text(album.name, color = c.text, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = Spacing.xs))
        Text(album.artist, color = c.textMuted, fontSize = Fonts.xs, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun ArtistRow(a: Artist, onClick: () -> Unit) {
    val c = Drift.colors
    Column {
        Row(Modifier.fillMaxWidth().tap(onClick).padding(horizontal = Spacing.md, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            CoverImage(coverUrl(a.coverArt, 120), Modifier.size(48.dp).clip(CircleShape).background(c.surfaceLight)) {
                Text(a.name.firstOrNull()?.uppercase() ?: "", color = c.primary, fontSize = Fonts.xl, fontWeight = FontWeight.Bold)
            }
            Text(a.name, color = c.text, fontSize = Fonts.md, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(horizontal = Spacing.md))
            Icon(Icons.Rounded.ChevronRight, null, Modifier.size(16.dp), tint = c.textMuted)
        }
        RowDivider()
    }
}

@Composable
private fun GenreRow(gen: Genre, onClick: () -> Unit) {
    val c = Drift.colors
    Column {
        Row(Modifier.fillMaxWidth().tap(onClick).padding(horizontal = Spacing.md, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(CircleShape).background(c.primary.copy(alpha = 0x22 / 255f)), contentAlignment = Alignment.Center) {
                Text(gen.name.firstOrNull()?.uppercase() ?: "", color = c.primary, fontSize = Fonts.lg, fontWeight = FontWeight.Bold)
            }
            Column(Modifier.weight(1f).padding(horizontal = Spacing.md)) {
                Text(gen.name, color = c.text, fontSize = Fonts.md, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(2.dp))
                Text("${gen.songCount} songs", color = c.textMuted, fontSize = Fonts.xs)
            }
            Icon(Icons.Rounded.ChevronRight, null, Modifier.size(16.dp), tint = c.textMuted)
        }
        RowDivider()
    }
}

@Composable private fun EmptySearch(text: String) = Text(text, color = Drift.colors.textMuted, fontSize = Fonts.sm, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = Spacing.xl))
@Composable private fun ServerResultsLabel() = Text("Server results", color = Drift.colors.textMuted, fontSize = Fonts.xs, fontStyle = FontStyle.Italic, modifier = Modifier.padding(horizontal = Spacing.md).padding(top = Spacing.sm, bottom = Spacing.xs))
