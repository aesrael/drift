package com.drift.app.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Album
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.drift.app.di.AppGraph
import com.drift.app.model.Lyrics
import com.drift.app.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** screens/NowPlayingScreen.tsx. Delete/purge is gone for server tracks (no Subsonic equivalent); device tracks keep "remove from list". */
@Composable
fun NowPlayingScreen() {
    val g = AppGraph
    val c = Drift.colors
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val st by g.player.state.collectAsState()
    val pos by g.player.position.collectAsState()
    val shuffle by g.player.shuffle.collectAsState()
    val source by g.player.source.collectAsState()
    val label by g.player.sourceLabel.collectAsState()
    val starred by g.actions.starredIds.collectAsState()
    val song = st.current

    val cover = coverUrl(song?.let { it.coverArt ?: it.albumId ?: it.id }, 700)
    var coverFailed by remember(cover) { mutableStateOf(false) }
    val shownCover = cover.takeIf { !coverFailed }
    var showLyrics by remember(song?.id) { mutableStateOf(false) }
    val lyricsQ = if (song != null) com.drift.app.data.rememberQuery(g.cache, "lyrics:${song.id}", 3_600_000) { g.router.lyrics(song) ?: Lyrics(emptyList(), false) } else null
    val lyrics = lyricsQ?.data
    val lyricsAvailable = lyrics != null && lyrics.lines.any { it.text.isNotBlank() }

    // palette (getNowPlayingPalette)
    val palette = rememberPalette(shownCover)
    var pPrimary = c.primary; var pSecondary = c.textSecondary; var pSurface = c.surface; var playGlyph = Color.White
    if (palette != null) {
        pSurface = mix(palette.darkVibrant, c.background, .9f)
        pPrimary = ensureContrast(palette.vibrant, pSurface, 3f, c.primary)
        pSecondary = ensureContrast(palette.muted, pSurface, 4.5f, c.textSecondary)
        playGlyph = readableOn(pPrimary)
    }

    // seek bar state
    val duration = (if (pos.durationMs > 0) pos.durationMs else (song?.durationSec ?: 0) * 1000L).coerceAtLeast(1)
    val live = pos.positionMs.coerceIn(0, duration)
    var scrubbing by remember { mutableStateOf(false) }
    var scrubValue by remember { mutableStateOf(0L) }
    var pendingSeek by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(song?.id) { scrubbing = false; pendingSeek = null }
    LaunchedEffect(pendingSeek) { if (pendingSeek != null) { delay(4000); pendingSeek = null } }
    LaunchedEffect(live) { pendingSeek?.let { if (kotlin.math.abs(live - it) <= 1500 || live >= it) pendingSeek = null } }
    val display = if (scrubbing) scrubValue else pendingSeek ?: live
    var barWidth by remember { mutableIntStateOf(0) }

    val canPrev = st.index > 0
    val canNext = st.index in 0 until st.queue.lastIndex
    val sourceLabel = label ?: "Current Queue"
    val kind = source?.kind
    val canNavigate = kind == "downloads" || kind == "recent" || kind == "top" || (source?.id != null && kind in setOf("playlist", "album", "genre", "artist"))
    var confirmRemove by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize().background(c.background)) {
        if (shownCover != null && !showLyrics) AsyncImage(shownCover, null, Modifier.fillMaxSize().alpha(.28f).scale(1.08f).blur(24.dp), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to pPrimary.copy(alpha = .24f), .5f to pSecondary.copy(alpha = .18f), 1f to c.background)))

        BoxWithConstraints(Modifier.fillMaxSize()) {
            val artSide = maxWidth - Spacing.lg * 2
            Column(Modifier.fillMaxSize().padding(horizontal = Spacing.lg).verticalScrollIfNeeded()) {
                Row(Modifier.fillMaxWidth().padding(top = Spacing.sm).padding(bottom = Spacing.lg), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(c.glass).tap { nav.popBackStack() }, contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.KeyboardArrowDown, "Close now playing", Modifier.size(26.dp), tint = c.text)
                    }
                    if (song != null && song.isLocal) {
                        val dark = Drift.isDark
                        Box(Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(if (dark) Color.White.copy(alpha = .08f) else Color.Black.copy(alpha = .04f))
                            .border(1.dp, if (dark) Color.White.copy(alpha = .3f) else Color.Black.copy(alpha = .25f), RoundedCornerShape(10.dp)).tap { confirmRemove = true }, contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.DeleteOutline, "Remove from list", Modifier.size(20.dp), tint = if (dark) Color.White else Color(0xFF111111))
                        }
                    }
                }

                Box(Modifier.size(artSide).shadow(15.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(c.surface), contentAlignment = Alignment.Center) {
                    when {
                        showLyrics && lyrics != null -> LyricsView(lyrics, Modifier.fillMaxSize())
                        shownCover != null -> AsyncImage(shownCover, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, onError = { coverFailed = true })
                        else -> DiskArtwork(artSide, st.isPlaying)
                    }
                }
                Spacer(Modifier.height(Spacing.xl))

                Text(song?.title ?: "No Track", color = c.text, fontSize = 28.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
                Text(song?.artist ?: "", color = c.textSecondary, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(Spacing.md))
                Row(
                    Modifier.clip(RoundedCornerShape(999.dp)).background(pSurface).border(1.dp, pSecondary.copy(alpha = .28f), RoundedCornerShape(999.dp))
                        .then(if (canNavigate) Modifier.tap { openSource(nav, source?.kind, source?.id, sourceLabel) } else Modifier).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(Icons.Outlined.Album, null, Modifier.size(14.dp), tint = pSecondary)
                    Text(sourceLabel.uppercase(), color = pSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.height(Spacing.md))

                // progress
                Box(Modifier.fillMaxWidth().height(32.dp).onSizeChanged { barWidth = it.width }.pointerInput(song?.id, duration) {
                    if (song == null) return@pointerInput
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        fun at(x: Float) = ((x / size.width).coerceIn(0f, 1f) * duration).toLong()
                        scrubbing = true; scrubValue = at(down.position.x)
                        do {
                            val ev = awaitPointerEvent()
                            ev.changes.firstOrNull()?.let { scrubValue = at(it.position.x); it.consume() }
                        } while (ev.changes.any { it.pressed })
                        val target = scrubValue
                        g.player.seekTo(target); pendingSeek = target; scrubbing = false
                    }
                }, contentAlignment = Alignment.CenterStart) {
                    val frac = (display.toFloat() / duration).coerceIn(0f, 1f)
                    Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(c.border))
                    Box(Modifier.fillMaxWidth(frac).height(4.dp).clip(CircleShape).background(pPrimary))
                    val thumbX = with(androidx.compose.ui.platform.LocalDensity.current) { (barWidth * frac).toDp() - 6.dp }
                    Box(Modifier.offset(x = thumbX.coerceAtLeast(0.dp)).size(12.dp).clip(CircleShape).background(if (song != null) pPrimary else c.textMuted))
                }
                Row(Modifier.fillMaxWidth().offset(y = (-4).dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(formatTime(display), color = c.textMuted, fontSize = Fonts.xs); Text(formatTime(duration), color = c.textMuted, fontSize = Fonts.xs)
                }
                Spacer(Modifier.height(Spacing.sm))

                // controls
                Row(Modifier.fillMaxWidth().padding(top = Spacing.sm, bottom = Spacing.xl), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.md, Alignment.CenterHorizontally)) {
                    RoundBtn(Icons.Rounded.Shuffle, 21, if (shuffle) pPrimary else c.textMuted) { g.player.toggleShuffle() }
                    RoundBtn(Icons.Rounded.SkipPrevious, 28, if (canPrev) c.text else c.textMuted, Modifier.alpha(if (canPrev) 1f else .45f)) { if (canPrev) g.player.previous() }
                    Box(Modifier.size(72.dp).shadow(8.dp, CircleShape, ambientColor = pPrimary, spotColor = pPrimary).clip(CircleShape).background(pPrimary).border(1.dp, pSecondary.copy(alpha = .45f), CircleShape).tap { if (song != null) g.player.toggle() }, contentAlignment = Alignment.Center) {
                        Icon(if (st.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (st.isPlaying) "Pause playback" else "Play track", Modifier.size(32.dp).offset(x = if (st.isPlaying) 0.dp else 2.dp), tint = playGlyph)
                        if (st.isBuffering) Spinner(Modifier.size(48.dp), playGlyph.copy(alpha = .55f))
                    }
                    RoundBtn(Icons.Rounded.SkipNext, 28, if (canNext) c.text else c.textMuted, Modifier.alpha(if (canNext) 1f else .45f)) { if (canNext) g.player.next() }
                    when {
                        lyricsAvailable -> RoundBtn(Icons.Outlined.Mic, 21, if (showLyrics) pPrimary else c.textMuted) { showLyrics = !showLyrics }
                        song != null -> { val on = song.id in starred; RoundBtn(if (on) Icons.Rounded.Favorite else Icons.Outlined.FavoriteBorder, 21, if (on) pPrimary else c.textMuted) { g.actions.toggleStar(song) } }
                        else -> Box(Modifier.size(48.dp))
                    }
                }
            }
        }
    }

    if (confirmRemove && song != null) AlertDialog(
        onDismissRequest = { confirmRemove = false }, title = { Text("Remove from list") },
        text = { Text("Remove \"${song.title}\" from your Drift list? Your file stays on this device.") },
        confirmButton = { TextButton(onClick = { confirmRemove = false; scope.launch { g.local.hide(listOf(song.id)); g.cache.invalidate(); g.player.next(); nav.popBackStack() } }) { Text("Remove", color = c.error) } },
        dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
    )
}

@Composable
private fun Modifier.verticalScrollIfNeeded() = this.verticalScroll(rememberScrollState())

@Composable
private fun RoundBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, size: Int, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = Drift.colors
    Box(modifier.size(48.dp).clip(CircleShape).background(c.glass).border(1.dp, c.border, CircleShape).tap(onClick), contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(size.dp), tint = tint) }
}

private fun openSource(nav: androidx.navigation.NavController, kind: String?, id: String?, label: String) {
    when (kind) {
        "playlist", "album", "genre" -> nav.navigate(CollectionRoute(kind, id ?: return, label))
        "artist" -> nav.navigate(SeeAllRoute(label, "tracks", artistId = id))
        "downloads" -> nav.navigate(DownloadsRoute)
        "recent", "top" -> nav.navigate(HomeRoute) { popUpTo(HomeRoute) { inclusive = false } }
    }
}
