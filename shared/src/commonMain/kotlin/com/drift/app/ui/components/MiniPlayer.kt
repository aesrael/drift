package com.drift.app.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.drift.app.di.AppGraph

/** components/MiniPlayer.tsx + ConnectedMiniPlayer.tsx. Positioned by the caller (bottom = 64 + inset, side 12). */
@Composable
fun MiniPlayer(modifier: Modifier = Modifier, onOpen: () -> Unit) {
    val g = AppGraph
    val c = Drift.colors
    val st by g.player.state.collectAsState()
    var last by remember { mutableStateOf(st.current) }
    LaunchedEffect(st.current) { st.current?.let { last = it } }
    val song = st.current ?: last ?: return
    val pos by g.player.position.collectAsState()
    val starred by g.actions.starredIds.collectAsState()
    val progress = if (pos.durationMs > 0) (pos.positionMs.toFloat() / pos.durationMs).coerceIn(0f, 1f) else 0f
    val canPrev = st.index > 0
    val canNext = st.index in 0 until st.queue.lastIndex
    val shape = RoundedCornerShape(20.dp)

    Column(modifier.shadow(10.dp, shape).clip(shape).background(c.surface).border(1.dp, c.glassBorder, shape).tap(onOpen)) {
        Box(Modifier.fillMaxWidth().height(2.dp).background(Color.White.copy(alpha = .05f))) {
            Box(Modifier.fillMaxWidth(progress).height(2.dp).background(c.primary))
        }
        Row(Modifier.padding(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            CoverImage(coverUrl(song.coverArt, 100), Modifier.size(48.dp).clip(RoundedCornerShape(6.dp)).background(c.border)) { DiskArtwork(32.dp, st.isPlaying, st.isBuffering) }
            Column(Modifier.weight(1f).padding(start = Spacing.sm)) {
                Text(song.title, color = c.text, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(song.artist, color = c.textMuted, fontSize = Fonts.xs, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 1.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                val on = song.id in starred
                Icon(if (on) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, "Favourite", Modifier.padding(end = Spacing.xs).padding(Spacing.xs).size(20.dp).tap { g.actions.toggleStar(song) }, tint = if (on) c.primary else c.textMuted)
                Icon(Icons.Rounded.SkipPrevious, "Previous", Modifier.padding(Spacing.xs).size(20.dp).tap { if (canPrev) g.player.previous() }, tint = if (canPrev) c.text else c.textMuted)
                Box(Modifier.padding(Spacing.xs).size(32.dp).tap { g.player.toggle() }, contentAlignment = Alignment.Center) {
                    Icon(if (st.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Play/pause", Modifier.size(24.dp), tint = c.text)
                    if (st.isBuffering) Spinner(Modifier.size(32.dp).alpha(.8f), c.primary)
                }
                Icon(Icons.Rounded.SkipNext, "Next", Modifier.padding(Spacing.xs).size(20.dp).tap { if (canNext) g.player.next() }, tint = if (canNext) c.text else c.textMuted)
            }
        }
    }
}

/** The `sync` Ionicon rotating once per second (isLoading overlay in the original). */
@Composable
fun Spinner(modifier: Modifier, tint: Color) {
    val a by rememberInfiniteTransition().animateFloat(0f, 360f, infiniteRepeatable(tween(1000, easing = LinearEasing)))
    Icon(Icons.Rounded.Sync, null, modifier.rotate(a), tint = tint)
}
