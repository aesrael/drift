package com.drift.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.HeartBroken
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.drift.app.data.rememberQuery
import com.drift.app.di.AppGraph
import com.drift.app.model.Song
import com.drift.app.player.QueueSource
import com.drift.app.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** screens/DownloadsScreen.tsx — downloaded + starred songs, offline-first (cached starred list survives a failed refresh). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadsScreen() {
    val g = AppGraph
    val c = Drift.colors
    val scope = rememberCoroutineScope()
    val st by g.player.state.collectAsState()
    val entries by g.downloads.entries.collectAsState()
    val starredIds by g.actions.starredIds.collectAsState()
    val starredQ = rememberQuery(g.cache, "starred:songs", ttlMs = 60_000) { g.router.starred().songs }
    var refreshing by remember { mutableStateOf(false) }

    val downloaded: List<Song> = entries.values.sortedByDescending { it.at }.map { it.song }
    val tracks = (downloaded + starredQ.data.orEmpty()).distinctBy { it.id }

    Column(Modifier.fillMaxSize().background(c.background)) {
        Header("Downloads")
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { refreshing = true; g.cache.invalidate("starred"); scope.launch { delay(500); refreshing = false } }) {
            LazyColumn(contentPadding = PaddingValues(start = Spacing.md, end = Spacing.md, top = Spacing.md, bottom = 150.dp), modifier = Modifier.fillMaxSize()) {
                items(tracks, key = { it.id }) { s ->
                    TrackItem(s, onClick = {
                        // Keep the queue to downloaded tracks so auto-next never jumps to something that isn't available offline.
                        val queue = downloaded.ifEmpty { tracks }
                        g.player.play(queue, queue.indexOfFirst { it.id == s.id }.coerceAtLeast(0), source = QueueSource("downloads", null, "Downloads"))
                    }, isPlaying = st.current?.id == s.id)
                }
                if (tracks.isEmpty()) item {
                    Column(Modifier.fillMaxWidth().padding(top = 100.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Outlined.HeartBroken, null, Modifier.size(64.dp), tint = c.textMuted)
                        Text("No starred or downloaded tracks yet.", color = c.textMuted, fontSize = Fonts.md, textAlign = TextAlign.Center, modifier = Modifier.padding(top = Spacing.md))
                    }
                }
            }
        }
    }
}
