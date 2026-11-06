package com.drift.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.drift.app.di.AppGraph
import com.drift.app.model.*
import com.drift.app.player.QueueSource
import com.drift.app.ui.*

/** screens/SeeAllScreen.tsx */
@Composable
fun SeeAllScreen(r: SeeAllRoute) {
    val g = AppGraph
    val c = Drift.colors
    val nav = LocalNav.current
    val epoch by g.cache.epoch.collectAsState()
    val pageSize = 20
    val localBatch = 30
    val titleText = r.title.ifBlank { "See All" }
    val listType = r.albumListType?.let { api -> AlbumListType.entries.firstOrNull { it.api == api } }
    val paginated = r.kind == "albums" && listType != null

    var songs by remember(r) { mutableStateOf<List<Song>>(emptyList()) }
    var albums by remember(r) { mutableStateOf<List<Album>>(emptyList()) }
    var playlists by remember(r) { mutableStateOf<List<Playlist>>(emptyList()) }
    var genres by remember(r) { mutableStateOf<List<Genre>>(emptyList()) }
    var loading by remember(r) { mutableStateOf(true) }
    var loadingMore by remember(r) { mutableStateOf(false) }
    var hasMore by remember(r) { mutableStateOf(true) }
    var visible by remember(r) { mutableIntStateOf(localBatch) }
    var more by remember(r) { mutableIntStateOf(0) }

    LaunchedEffect(r, epoch) {
        loading = true
        try {
            when {
                paginated -> { val p = g.router.albumList(listType!!, pageSize, 0); albums = p; hasMore = p.size == pageSize && !(listType == AlbumListType.Recent && p.size >= 300) }
                r.artistId != null && r.kind == "tracks" -> {
                    songs = g.router.topSongs(r.title, 100)
                    if (songs.isEmpty()) { // servers without a last.fm agent have no "top songs": fall back to the artist's albums
                        albums = g.router.artist(r.artistId).albums
                    }
                    hasMore = false
                }
                r.artistId != null && r.kind == "albums" -> { albums = g.router.artist(r.artistId).albums; hasMore = false }
                r.query != null && r.kind == "tracks" -> songs = g.router.search(r.query, songCount = 100).songs
                r.query != null && r.kind == "albums" -> albums = g.router.search(r.query, albumCount = 100).albums
                r.kind == "playlists" -> playlists = g.router.playlists()
                r.kind == "genres" -> genres = g.router.genres()
            }
        } catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e } catch (e: Exception) { g.actions.message(friendlyError(e)) }
        loading = false
    }
    LaunchedEffect(more) {
        if (more == 0 || !paginated || loadingMore || !hasMore) return@LaunchedEffect
        loadingMore = true
        try {
            val next = g.router.albumList(listType!!, pageSize, albums.size)
            albums = albums + next; hasMore = next.size == pageSize && !(listType == AlbumListType.Recent && albums.size >= 300)
        } catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e } catch (_: Exception) { }
        loadingMore = false
    }

    val showAlbums = r.kind == "albums" || (r.kind == "tracks" && songs.isEmpty() && albums.isNotEmpty())
    val total = when { r.kind == "playlists" -> playlists.size; r.kind == "genres" -> genres.size; showAlbums -> albums.size; else -> songs.size }
    val list = rememberLazyListState()
    EndReached(list) { if (paginated) more++ else if (visible < total) visible = minOf(visible + localBatch, total) }

    Column(Modifier.fillMaxSize().background(c.background)) {
        Row(Modifier.fillMaxWidth().padding(start = Spacing.md, end = Spacing.md, top = Spacing.sm, bottom = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            BackButton { nav.popBackStack() }
            Text(titleText, color = c.text, fontSize = Fonts.xl, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(horizontal = Spacing.sm))
            Spacer(Modifier.size(36.dp))
        }
        if (loading) Loader(Modifier.padding(top = Spacing.lg)) else LazyColumn(state = list, contentPadding = PaddingValues(bottom = 150.dp)) {
            when {
                r.kind == "playlists" -> itemsIndexed(playlists.take(visible), key = { i, p -> "${p.id}-$i" }) { i, p ->
                    SimpleRow(i, p.name, null, "${p.songCount} tracks") { nav.navigate(CollectionRoute("playlist", p.id, p.name, p.coverArt)) }
                }
                r.kind == "genres" -> itemsIndexed(genres.take(visible), key = { i, gn -> "${gn.name}-$i" }) { i, gn ->
                    SimpleRow(i, gn.name, null, "${gn.songCount} tracks") { nav.navigate(CollectionRoute("genre", gn.name, gn.name)) }
                }
                showAlbums -> itemsIndexed(if (paginated) albums else albums.take(visible), key = { i, a -> "${a.id}-$i" }) { i, a ->
                    SimpleRow(i, a.name, a.artist, null, chevron = true) { nav.navigate(CollectionRoute("album", a.id, a.name, a.coverArt)) }
                }
                else -> itemsIndexed(songs.take(visible), key = { i, s -> "${s.id}-$i" }) { i, s ->
                    TrackItem(s, onClick = { g.player.play(songs, i, source = QueueSource("queue", null, titleText)) }, showNumber = true)
                }
            }
            if (loadingMore) item { Loader(Modifier.padding(vertical = Spacing.md)) }
        }
    }
}

@Composable
private fun SimpleRow(index: Int, title: String, subtitle: String?, trailing: String?, chevron: Boolean = false, onClick: () -> Unit) {
    val c = Drift.colors
    Column {
        Row(Modifier.fillMaxWidth().tap(onClick).padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
            Text("${index + 1}", color = c.textMuted, fontSize = Fonts.sm, textAlign = TextAlign.Center, modifier = Modifier.width(24.dp))
            Column(Modifier.weight(1f).padding(horizontal = Spacing.sm)) {
                Text(title, color = c.text, fontSize = Fonts.md, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) Text(subtitle, color = c.textSecondary, fontSize = Fonts.sm, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
            }
            if (trailing != null) Text(trailing, color = c.textSecondary, fontSize = Fonts.sm, modifier = Modifier.padding(top = 2.dp))
            if (chevron) Icon(Icons.Rounded.ChevronRight, null, Modifier.size(16.dp), tint = c.textMuted)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.border))
    }
}
