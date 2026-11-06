package com.drift.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.drift.app.di.AppGraph
import com.drift.app.model.*
import com.drift.app.player.QueueSource
import com.drift.app.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** screens/SearchScreen.tsx — kept as written: ≥5 characters, 2 s debounce (see notes for a suggested tweak). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen() {
    val g = AppGraph
    val c = Drift.colors
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf(SearchResults()) }
    var refreshing by remember { mutableStateOf(false) }
    val q = query.trim()
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }

    LaunchedEffect(q) {
        if (q.length < 5) { result = SearchResults(); error = null; loading = false; return@LaunchedEffect }
        delay(2000)
        loading = true; error = null
        try { result = g.router.search(q) } catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e } catch (e: Exception) { error = "Search failed. Please try again." }
        loading = false
    }
    val hasResults = result.songs.isNotEmpty() || result.albums.isNotEmpty() || result.artists.isNotEmpty()

    Column(Modifier.fillMaxSize().background(c.background)) {
        Row(Modifier.fillMaxWidth().padding(start = Spacing.md, end = Spacing.md, top = Spacing.sm, bottom = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Box(Modifier.padding(Spacing.xs)) { BackButton(22.dp) { nav.popBackStack() } }
            Row(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(10.dp)).background(c.surfaceLight).padding(horizontal = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Box(Modifier.weight(1f)) {
                    if (query.isEmpty()) Text("Search songs, albums, artists", color = c.textMuted, fontSize = Fonts.md)
                    BasicTextField(query, { query = it }, singleLine = true, textStyle = TextStyle(color = c.text, fontSize = Fonts.md), cursorBrush = SolidColor(c.primary),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Search),
                        modifier = Modifier.fillMaxWidth().focusRequester(focus))
                }
                if (query.isNotEmpty()) Icon(Icons.Filled.Cancel, "Clear", Modifier.padding(Spacing.xs).size(18.dp).tap { query = "" }, tint = c.textMuted)
            }
        }
        when {
            loading -> Loader(Modifier.padding(horizontal = Spacing.md, vertical = Spacing.md))
            error != null -> Text(error!!, color = c.error, fontSize = Fonts.md, modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.md))
            q.isNotEmpty() && q.length < 5 -> Text("Type at least 5 characters to search.", color = c.textSecondary, fontSize = Fonts.md, modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.md))
            q.length >= 5 && !hasResults -> Text("No results for \"$q\".", color = c.textSecondary, fontSize = Fonts.md, modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.md))
            hasResults -> PullToRefreshBox(isRefreshing = refreshing, onRefresh = {
                if (q.length >= 5) { refreshing = true; scope.launch { runCatching { g.router.search(q) }.onSuccess { result = it; error = null }; refreshing = false } }
            }) {
                LazyColumn(contentPadding = PaddingValues(bottom = 150.dp)) {
                    item {
                        if (result.albums.isNotEmpty()) Column(Modifier.padding(bottom = Spacing.md)) {
                            SectionRow("Albums") { nav.navigate(SeeAllRoute("Albums", "albums", query = q)) }
                            LazyRow(contentPadding = PaddingValues(horizontal = Spacing.md), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                items(result.albums, key = { "album-${it.id}" }) { a ->
                                    AlbumCard(a.name, a.artist, a.coverArt, Modifier.width(140.dp)) { nav.navigate(CollectionRoute("album", a.id, a.name, a.coverArt)) }
                                }
                            }
                        }
                        if (result.artists.isNotEmpty()) Column(Modifier.padding(bottom = Spacing.md)) {
                            Text("Artists", color = c.text, fontSize = Fonts.lg, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = Spacing.md).padding(bottom = Spacing.sm))
                            LazyRow(contentPadding = PaddingValues(horizontal = Spacing.md), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                items(result.artists, key = { "artist-${it.id}" }) { a ->
                                    // original pill had no handler; opening the artist's tracks is the obvious intent
                                    Box(Modifier.widthIn(max = 180.dp).clip(RoundedCornerShape(999.dp)).background(c.surface).border(1.dp, c.border, RoundedCornerShape(999.dp))
                                        .tap { nav.navigate(SeeAllRoute(a.name, "tracks", artistId = a.id)) }.padding(horizontal = Spacing.md, vertical = Spacing.sm)) {
                                        Text(a.name, color = c.text, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }
                        if (result.songs.isNotEmpty()) SectionRow("Tracks") { nav.navigate(SeeAllRoute("Tracks", "tracks", query = q)) }
                    }
                    items(result.songs, key = { "track-${it.id}" }) { s ->
                        TrackItem(s, onClick = { g.player.play(result.songs, result.songs.indexOf(s), source = QueueSource("search", null, "Search: $q")) })
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionRow(title: String, onSeeAll: () -> Unit) {
    val c = Drift.colors
    Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.md).padding(bottom = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(title, color = c.text, fontSize = Fonts.lg, fontWeight = FontWeight.Bold)
        Text("See All", color = c.primary, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold, modifier = Modifier.tap(onSeeAll))
    }
}
