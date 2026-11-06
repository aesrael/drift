package com.drift.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drift.app.data.HomeData
import com.drift.app.data.rememberQuery
import com.drift.app.di.AppGraph
import com.drift.app.model.AlbumListType
import com.drift.app.player.QueueSource
import com.drift.app.ui.*
import kotlinx.coroutines.launch

private val HOME_COMPACT_CARD_WIDTH = 156.dp
private const val THIRTY_MIN = 30 * 60_000L

/** screens/QuickPlayScreen.tsx (Drift Radio / free-play removed; see porting notes). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen() {
    val g = AppGraph
    val c = Drift.colors
    val dark = Drift.isDark
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val st by g.player.state.collectAsState()
    val recentQ = rememberQuery(g.cache, "home:recentSongs", THIRTY_MIN) { HomeData.recentSongs(40) }
    val topQ = rememberQuery(g.cache, "home:topSongs", THIRTY_MIN) { HomeData.topSongs(40) }
    val albumsQ = rememberQuery(g.cache, "home:recentlyAddedAlbums", THIRTY_MIN) { g.router.albumList(AlbumListType.Newest, 12) }
    val recent = recentQ.data.orEmpty()
    val top = topQ.data.orEmpty()
    val albums = albumsQ.data.orEmpty()
    val heroTrack = st.current ?: recent.firstOrNull() ?: top.firstOrNull()
    var refreshing by remember { mutableStateOf(false) }

    val coverId = heroTrack?.let { it.coverArt ?: it.albumId ?: it.id }
    val heroUrl = coverUrl(coverId, 600)
    val palette = rememberPalette(heroUrl)
    var heroAccent = c.primary; var heroLabel = c.primary; var tintStart = Color.Transparent
    if (palette != null) {
        val tint = mix(palette.dominant, c.background, if (dark) .66f else .86f)
        val surface = mix(palette.muted, c.background, if (dark) .78f else .92f)
        heroAccent = ensureContrast(palette.vibrant, surface, 2.8f, c.primary)
        heroLabel = ensureContrast(palette.vibrant, surface, 2.2f, c.primary)
        tintStart = if (dark) tint.copy(alpha = .42f) else Color.Transparent
    }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = {
        refreshing = true
        g.cache.invalidate("home:")
        scope.launch { g.refreshLibraryState(); refreshing = false }
    }, modifier = Modifier.fillMaxSize().background(c.background)) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val artSize = maxWidth - Spacing.lg * 2
            val diskSize = minOf(maxWidth.value * .55f, 220f).dp
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 150.dp)) {
                Box(Modifier.fillMaxWidth().background(c.background)) {
                    Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(tintStart, c.background))))
                    Column(Modifier.fillMaxWidth().padding(top = Spacing.md, bottom = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.lg).padding(bottom = Spacing.md), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("DRIFT", color = c.primary, fontSize = 20.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp)
                            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                GlassIconButton(Icons.Outlined.Search, 20, "Open search") { nav.navigate(SearchRoute) }
                                GlassIconButton(Icons.Rounded.KeyboardArrowUp, 20, "Open now playing") { nav.navigate(NowPlayingRoute) }
                                GlassIconButton(Icons.Outlined.AccountCircle, 22, "Open settings") { nav.navigate(SettingsRoute) }
                            }
                        }
                        Box(Modifier.size(artSize).shadow(20.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).tap { nav.navigate(NowPlayingRoute) }) {
                            CoverImage(heroUrl, Modifier.fillMaxSize().background(c.border)) { DiskArtwork(diskSize, st.isPlaying, st.isBuffering) }
                        }
                        Spacer(Modifier.height(24.dp))
                        if (heroTrack != null) {
                            val cardShape = RoundedCornerShape(20.dp)
                            Row(
                                Modifier.width(artSize).clip(cardShape)
                                    .background(if (dark) Color.White.copy(alpha = .04f) else Color(0xFFFAFAFB))
                                    .border(1.dp, if (dark) Color.White.copy(alpha = .06f) else Color(0xFF111827).copy(alpha = .03f), cardShape)
                                    .padding(Spacing.lg),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(Modifier.weight(1f).padding(end = Spacing.md).tap { nav.navigate(NowPlayingRoute) }) {
                                    Text("JUMP BACK IN", color = heroLabel, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.5.sp)
                                    Spacer(Modifier.height(4.dp))
                                    Text(heroTrack.title, color = c.text, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(heroTrack.artist, color = c.textSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                                }
                                Box(Modifier.size(50.dp).clip(CircleShape).background(heroAccent).tap {
                                    when {
                                        st.isPlaying -> g.player.pause()
                                        st.current != null -> g.player.toggle()
                                        else -> {
                                            val (list, src) = when {
                                                recent.any { it.id == heroTrack.id } -> recent to QueueSource("recent", null, "Recent Songs")
                                                top.any { it.id == heroTrack.id } -> top to QueueSource("top", null, "Top Songs")
                                                else -> listOf(heroTrack) to QueueSource("manual", null, "Now Playing")
                                            }
                                            g.player.play(list, list.indexOfFirst { it.id == heroTrack.id }.coerceAtLeast(0), source = src)
                                        }
                                    }
                                }, contentAlignment = Alignment.Center) {
                                    Icon(if (st.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, Modifier.size(28.dp), tint = Color.White)
                                }
                            }
                        }
                    }
                }

                if (recent.isNotEmpty()) Column(Modifier.padding(top = Spacing.lg)) {
                    SectionHeader("Recent Songs")
                    TrackHorizontalList(recent, HOME_COMPACT_CARD_WIDTH, Spacing.sm) { s ->
                        g.player.play(recent, recent.indexOfFirst { it.id == s.id }, source = QueueSource("recent", null, "Recent Songs"))
                    }
                }
                if (top.isNotEmpty()) Column(Modifier.padding(top = Spacing.lg)) {
                    SectionHeader("Top Songs")
                    TrackHorizontalList(top.take(10), HOME_COMPACT_CARD_WIDTH, Spacing.sm) { s ->
                        g.player.play(top, top.indexOfFirst { it.id == s.id }, source = QueueSource("top", null, "Top Songs"))
                    }
                }
                if (albums.isNotEmpty()) Column(Modifier.padding(top = Spacing.lg)) {
                    SectionHeader("Recently Added")
                    AlbumHorizontalList(albums, HOME_COMPACT_CARD_WIDTH) { a -> nav.navigate(CollectionRoute("album", a.id, a.name, a.coverArt)) }
                }
            }
        }
    }
}

@Composable
fun GlassIconButton(icon: androidx.compose.ui.graphics.vector.ImageVector, iconSize: Int, label: String, onClick: () -> Unit) {
    val c = Drift.colors
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.glass).border(1.dp, c.glassBorder, RoundedCornerShape(12.dp)).tap(onClick), contentAlignment = Alignment.Center) {
        Icon(icon, label, Modifier.size(iconSize.dp), tint = c.text)
    }
}
