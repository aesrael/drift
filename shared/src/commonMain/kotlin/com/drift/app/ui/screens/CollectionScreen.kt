package com.drift.app.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.drift.app.di.AppGraph
import com.drift.app.model.*
import com.drift.app.player.QueueSource
import com.drift.app.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** screens/CollectionDetailsScreen.tsx — album / playlist / genre. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionScreen(type: String, id: String, name: String, initialCover: String?) {
    val g = AppGraph
    val c = Drift.colors
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val starredIds by g.actions.starredIds.collectAsState()
    val epoch by g.cache.epoch.collectAsState()

    var tracks by remember(type, id) { mutableStateOf<List<Song>>(emptyList()) }
    var loading by remember(type, id) { mutableStateOf(true) }
    var cover by remember(type, id) { mutableStateOf(initialCover) }
    var subtitle by remember(type, id) { mutableStateOf("") }
    var lastUpdated by remember(type, id) { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    var showSearch by remember(type, id) { mutableStateOf(false) }
    var removalMode by remember(type, id) { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(type, id, reload, epoch) {
        loading = tracks.isEmpty()
        try {
            when (type) {
                "album" -> {
                    val d = g.router.album(id)
                    tracks = d.songs
                    val total = d.album.durationSec.takeIf { it > 0 } ?: d.songs.sumOf { it.durationSec }
                    subtitle = "${d.album.artist} • ${d.songs.size} songs • ${formatTotal(total)}" + if (d.album.year > 0) " • ${d.album.year}" else ""
                    if (cover == null) cover = d.album.coverArt
                }
                "playlist" -> {
                    val p = g.router.playlist(id)
                    tracks = p.songs
                    val total = p.durationSec.takeIf { it > 0 } ?: p.songs.sumOf { it.durationSec }
                    subtitle = "${p.songs.size} songs • ${formatTotal(total)}"
                    if (cover == null) cover = p.coverArt
                }
                else -> {
                    tracks = g.router.songsByGenre(id, 500)
                    subtitle = "${tracks.size} songs • ${formatTotal(tracks.sumOf { it.durationSec })}"
                }
            }
            if (cover == null) cover = tracks.firstOrNull { it.coverArt != null }?.coverArt ?: tracks.firstOrNull()?.albumId
        } catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e } catch (e: Exception) { g.actions.message(friendlyError(e)) }
        loading = false
    }

    val coverUrl600 = coverUrl(cover, 600)
    val palette = rememberPalette(coverUrl600)
    var accent = c.primary; var heroStart = Color.Transparent
    if (palette != null) {
        accent = ensureContrast(palette.vibrant, c.background, 3f, c.primary)
        heroStart = mix(palette.dominant, c.background, .72f).copy(alpha = .34f)
    }
    val source = QueueSource(type, id, name)

    Column(Modifier.fillMaxSize().background(c.background)) {
        Row(Modifier.fillMaxWidth().padding(start = Spacing.md, end = Spacing.md, top = Spacing.sm, bottom = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Go back", Modifier.padding(Spacing.xs).size(24.dp).tap { nav.popBackStack() }, tint = c.text)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (type == "playlist") {
                    Icon(if (showSearch) Icons.Rounded.Close else Icons.Rounded.Add, if (showSearch) "Close add songs" else "Add songs", Modifier.padding(start = Spacing.sm).padding(Spacing.xs).size(24.dp).tap { showSearch = !showSearch }, tint = c.text)
                    Icon(if (removalMode) Icons.Rounded.Check else Icons.Rounded.Remove, if (removalMode) "Finish remove mode" else "Enable remove mode", Modifier.padding(start = Spacing.sm).padding(Spacing.xs).size(24.dp).tap { removalMode = !removalMode }, tint = if (removalMode) c.primary else c.text)
                    Icon(Icons.Rounded.Delete, "Delete this playlist", Modifier.padding(start = Spacing.sm).padding(Spacing.xs).size(20.dp).tap { confirmDelete = true }, tint = c.text)
                }
            }
        }

        if (showSearch && type == "playlist") AddSongsPanel(id, tracks.map { it.id }.toSet()) { showSearch = false; reload++ }

        if (loading && tracks.isEmpty()) {
            Column(Modifier.fillMaxSize()) {
                CollectionDetailsSkeleton()
            }
        } else PullToRefreshBox(isRefreshing = refreshing, onRefresh = { refreshing = true; scope.launch { reload++; delay(500); refreshing = false } }) {
            LazyColumn(contentPadding = PaddingValues(bottom = 100.dp), modifier = Modifier.fillMaxSize()) {
                item {
                    Box(Modifier.fillMaxWidth()) {
                        if (coverUrl600 != null) AsyncImage(coverUrl600, null, Modifier.matchParentSize().alpha(.26f).scale(1.04f).blur(22.dp), contentScale = ContentScale.Crop)
                        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(heroStart, c.background))))
                        Column(Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.lg), horizontalAlignment = Alignment.CenterHorizontally) {
                            CoverImage(coverUrl600, Modifier.size(200.dp).shadow(10.dp, RoundedCornerShape(8.dp)).clip(RoundedCornerShape(8.dp)).background(c.surfaceLight)) {
                                Icon(if (type == "album") Icons.Rounded.Album else Icons.Rounded.MusicNote, null, Modifier.size(64.dp), tint = c.textMuted)
                            }
                            Spacer(Modifier.height(Spacing.md))
                            Text(name, color = c.text, fontSize = Fonts.xl, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                            Spacer(Modifier.height(4.dp))
                            Text(subtitle, color = c.textSecondary, fontSize = Fonts.md)
                            if (type == "playlist" && lastUpdated != null) Text(lastUpdated!!, color = c.textMuted, fontSize = Fonts.sm, modifier = Modifier.padding(top = 4.dp))
                            Spacer(Modifier.height(Spacing.lg))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Row(Modifier.clip(RoundedCornerShape(30.dp)).background(accent).tap { if (tracks.isNotEmpty()) g.player.play(tracks, 0, shuffle = false, source = source) }.padding(horizontal = Spacing.xl, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Rounded.PlayArrow, "Play collection", Modifier.size(24.dp), tint = Color.White)
                                    Text("Play", color = Color.White, fontWeight = FontWeight.Bold, fontSize = Fonts.md, modifier = Modifier.padding(start = 8.dp))
                                }
                                RoundIconPill(Icons.Rounded.Shuffle, accent, accent.copy(alpha = .25f), "Shuffle play collection") { g.player.playShuffled(tracks, source = source) }
                                if (type == "album") {
                                    val on = id in starredIds
                                    RoundIconPill(if (on) Icons.Rounded.Favorite else Icons.Outlined.FavoriteBorder, if (on) c.primary else c.text, accent.copy(alpha = .25f), if (on) "Remove album from favorites" else "Add album to favorites") { g.actions.toggleStar(StarKind.Album, id) }
                                }
                            }
                        }
                    }
                }
                itemsIndexed(tracks, key = { i, s -> "${s.id}-$i" }) { i, s ->
                    TrackItem(s, onClick = {
                        if (removalMode) { g.actions.removeFromPlaylist(id, i); tracks = tracks.filterIndexed { j, _ -> j != i } }
                        else g.player.play(tracks, i, source = source)
                    }, showNumber = type == "album", isRemovalMode = removalMode, onRemove = { g.actions.removeFromPlaylist(id, i); tracks = tracks.filterIndexed { j, _ -> j != i } })
                }
            }
        }
    }

    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Delete Playlist") },
        text = { Text("This will remove the playlist. The original music files will NOT be deleted.") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; g.actions.deletePlaylist(id) { nav.popBackStack() } }) { Text("DELETE", color = c.error) } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
    )
}

@Composable
private fun RoundIconPill(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, border: Color, label: String, onClick: () -> Unit) {
    val c = Drift.colors
    Box(Modifier.padding(start = Spacing.sm).clip(RoundedCornerShape(30.dp)).background(c.surface).border(1.dp, border, RoundedCornerShape(30.dp)).tap(onClick).padding(horizontal = Spacing.md, vertical = Spacing.sm), contentAlignment = Alignment.Center) {
        Icon(icon, label, Modifier.size(24.dp), tint = tint)
    }
}

/** "Search for songs to add…" panel (≥5 chars, 2 s debounce, ✓ Added state), as in the original. */
@Composable
private fun AddSongsPanel(playlistId: String, existing: Set<String>, onAdded: () -> Unit) {
    val g = AppGraph
    val c = Drift.colors
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Song>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var added by remember { mutableStateOf(existing) }
    var adding by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 5) { results = emptyList(); return@LaunchedEffect }
        delay(2000); searching = true
        runCatching { g.router.search(q).songs }.onSuccess { results = it }
        searching = false
    }
    Column(Modifier.fillMaxWidth().heightIn(max = 300.dp).background(c.background).padding(horizontal = Spacing.md).padding(bottom = Spacing.sm)) {
        Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(8.dp)).background(c.surfaceLight).padding(horizontal = Spacing.md), contentAlignment = Alignment.CenterStart) {
            if (query.isEmpty()) Text("Search for songs to add...", color = c.textMuted, fontSize = Fonts.md)
            BasicTextField(query, { query = it }, singleLine = true, textStyle = TextStyle(color = c.text, fontSize = Fonts.md), cursorBrush = SolidColor(c.primary), modifier = Modifier.fillMaxWidth())
        }
        if (searching) Loader(Modifier.padding(10.dp))
        LazyColumn(Modifier.padding(top = Spacing.xs)) {
            itemsIndexed(results, key = { _, s -> "search-${s.id}" }) { _, s ->
                val already = s.id in added
                Row(Modifier.fillMaxWidth().alpha(if (already) .55f else 1f).tap {
                    if (already || adding != null) return@tap
                    adding = s.id
                    scope.launch {
                        try { g.router.addToPlaylist(playlistId, listOf(s.id)); added = added + s.id; g.cache.invalidate("playlist"); delay(700); onAdded() }
                        catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e } catch (e: Exception) { g.actions.message("Failed to add track to playlist") }
                        adding = null
                    }
                }.padding(vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                    Icon(when { already -> Icons.Rounded.CheckCircle; adding == s.id -> Icons.Rounded.Sync; else -> Icons.Outlined.AddCircleOutline }, null, Modifier.padding(end = 10.dp).size(20.dp), tint = if (adding == s.id) c.textMuted else c.primary)
                    Column(Modifier.weight(1f)) {
                        Text(s.title, color = if (already) c.textMuted else c.text, fontSize = Fonts.md, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(s.artist, color = c.textMuted, fontSize = Fonts.sm, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (already) Text("Added", color = c.primary, fontSize = Fonts.xs, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = Spacing.xs))
                }
                Box(Modifier.fillMaxWidth().height(0.5.dp).background(c.border))
            }
        }
    }
}
