package com.drift.app.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drift.app.data.LrcParser
import com.drift.app.di.AppGraph
import com.drift.app.model.Lyrics

/** components/LyricsView.tsx — SYNCED / STATIC TEXT badge, left-aligned 26sp lines, active 32sp primary. */
@Composable
fun LyricsView(lyrics: Lyrics, modifier: Modifier = Modifier) {
    val c = Drift.colors
    val synced = lyrics.synced && lyrics.lines.any { it.startMs != null }
    BoxWithConstraints(modifier) {
        val h = maxHeight
        if (!synced) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.xl).padding(top = 80.dp, bottom = Spacing.xl)) {
                Text(lyrics.lines.joinToString("\n") { it.text }, color = c.text, fontSize = 20.sp, lineHeight = 32.sp, textAlign = TextAlign.Center, fontWeight = FontWeight.Medium, letterSpacing = (-0.3).sp, modifier = Modifier.fillMaxWidth())
            }
        } else {
            val pos by AppGraph.player.position.collectAsState()
            val active = LrcParser.activeIndex(lyrics.lines, pos.positionMs)
            val list = rememberLazyListState()
            val offsetPx = with(LocalDensity.current) { 80.dp.roundToPx() }
            LaunchedEffect(active) { if (active >= 0) list.animateScrollToItem(active, offsetPx) }
            LazyColumn(state = list, contentPadding = PaddingValues(start = Spacing.xl, end = Spacing.xl, top = h * .22f, bottom = h * .4f), modifier = Modifier.fillMaxSize()) {
                itemsIndexed(lyrics.lines) { i, line ->
                    val on = i == active
                    Text(
                        line.text.ifBlank { "♪" }, color = if (on) c.primary else c.text,
                        fontSize = if (on) 32.sp else 26.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 38.sp, letterSpacing = (-0.8).sp,
                        modifier = Modifier.fillMaxWidth().alpha(if (on) 1f else if (i < active) .5f else .25f)
                            .tap { line.startMs?.let { AppGraph.player.seekTo(it) } }.padding(vertical = 12.dp),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = Spacing.md).align(Alignment.TopCenter), horizontalArrangement = Arrangement.Center) {
            Box(Modifier.clip(RoundedCornerShape(20.dp)).background(if (synced) c.primary.copy(alpha = .08f) else c.surface).border(1.dp, c.glassBorder, RoundedCornerShape(20.dp)).padding(horizontal = 12.dp, vertical = 5.dp)) {
                Text(if (synced) "● SYNCED" else "STATIC TEXT", color = if (synced) c.primary else c.textSecondary, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.2.sp)
            }
        }
    }
}
