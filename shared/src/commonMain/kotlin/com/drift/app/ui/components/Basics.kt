package com.drift.app.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Canvas
import androidx.navigation.NavController
import coil3.compose.AsyncImage
import com.drift.app.di.AppGraph

val LocalNav = staticCompositionLocalOf<NavController> { error("no nav") }

fun Modifier.tap(onClick: () -> Unit) = this.clickable(onClick = onClick)

/** components/Header.tsx — 24sp bold title, optional right action, padding 16/8/16. */
@Composable
fun Header(title: String? = null, rightAction: @Composable RowScope.() -> Unit = {}) {
    val c = Drift.colors
    Row(
        Modifier.fillMaxWidth().background(c.background).padding(start = Spacing.md, end = Spacing.md, top = Spacing.sm, bottom = Spacing.md),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        if (title != null) Text(title, color = c.text, fontSize = Fonts.xxl, fontWeight = FontWeight.Bold) else Spacer(Modifier.width(1.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm), content = rightAction)
    }
}

/** components/SectionHeader.tsx */
@Composable
fun SectionHeader(title: String, onSeeAll: (() -> Unit)? = null, seeAllLabel: String = "See all") {
    val c = Drift.colors
    Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.md).padding(bottom = Spacing.md), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(title, color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
        if (onSeeAll != null) Text(seeAllLabel, color = c.primary, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold, modifier = Modifier.tap(onSeeAll))
    }
}

/** Back-arrow header row used by SeeAll / Search / Settings. */
@Composable
fun BackButton(size: Dp = 36.dp, icon: ImageVector = Icons.AutoMirrored.Rounded.ArrowBack, iconSize: Dp = 22.dp, onClick: () -> Unit) {
    Box(Modifier.size(size).tap(onClick), contentAlignment = Alignment.Center) { Icon(icon, "Back", Modifier.size(iconSize), tint = Drift.colors.text) }
}

@Composable
fun Loader(modifier: Modifier = Modifier) = Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
    CircularProgressIndicator(Modifier.size(24.dp), color = Drift.colors.primary, strokeWidth = 2.dp)
}

// ---- artwork -------------------------------------------------------------------------------------------------------

@Composable
fun coverUrl(coverArt: String?, sizePx: Int): String? = remember(coverArt, sizePx) { coverArt?.takeIf { it.isNotBlank() }?.let { AppGraph.router.coverArtUrl(it, sizePx) } }

/** Image with a fallback drawn underneath, so a missing/failed cover just shows the fallback (original: coverFailed state). */
@Composable
fun CoverImage(url: String?, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop, fallback: @Composable () -> Unit = {}) {
    var failed by remember(url) { mutableStateOf(false) }
    Box(modifier, contentAlignment = Alignment.Center) {
        if (url == null || failed) fallback()
        if (url != null && !failed) AsyncImage(model = url, contentDescription = null, contentScale = contentScale, modifier = Modifier.fillMaxSize(), onError = { failed = true })
    }
}

/** components/DiskArtwork.tsx — OLED vinyl, same colours/ratios/rotation speeds. */
@Composable
fun DiskArtwork(size: Dp, isSpinning: Boolean = false, isLoading: Boolean = false, color: Color? = null) {
    val accent = color ?: Drift.colors.tertiary
    val spin = isSpinning || isLoading
    val angle = remember { Animatable(0f) }
    LaunchedEffect(spin, isLoading) {
        if (spin) {
            while (true) {
                angle.snapTo(0f)
                angle.animateTo(360f, tween(if (isLoading) 1200 else 12000, easing = LinearEasing))
            }
        } else angle.snapTo(0f)
    }
    Canvas(Modifier.size(size).rotate(angle.value)) {
        val s = this.size.minDimension
        val ctr = Offset(s / 2, s / 2)
        drawCircle(Color(0xFF050505), s / 2, ctr)
        drawCircle(Color(0xFF121212), s / 2, ctr)
        listOf(.95f, .90f, .85f, .80f, .75f, .70f, .65f, .60f, .55f, .50f).forEach {
            drawCircle(Color.White.copy(alpha = .03f), s * it / 2, ctr, style = Stroke(.5.dp.toPx()))
        }
        // shine: translucent rotated bar, clipped to the disk
        clipPathCircle(ctr, s / 2) {
            rotate(-25f, ctr) {
                drawRoundRect(Color.White.copy(alpha = .15f * .15f), Offset(s * .25f, -s * .25f), Size(s * .5f, s * 1.5f), androidx.compose.ui.geometry.CornerRadius(s * .25f))
            }
        }
        val label = s * .38f
        drawCircle(Color(0xFFF5F5F5), label / 2, ctr)
        drawCircle(Color.Black.copy(alpha = .1f), label / 2, ctr, style = Stroke(1.dp.toPx()))
        drawCircle(accent.copy(alpha = .4f), label * .85f / 2, ctr, style = Stroke(.5.dp.toPx()))
        val y0 = ctr.y - 2.75.dp.toPx()
        drawRoundRect(Color(0xFF333333).copy(alpha = .8f), Offset(ctr.x - label * .2f, y0), Size(label * .4f, 1.5.dp.toPx()), androidx.compose.ui.geometry.CornerRadius(1.dp.toPx()))
        drawRoundRect(Color(0xFF666666).copy(alpha = .6f), Offset(ctr.x - label * .125f, y0 + 4.5.dp.toPx()), Size(label * .25f, 1.dp.toPx()), androidx.compose.ui.geometry.CornerRadius(1.dp.toPx()))
        drawCircle(Color(0xFF010101), s * .08f / 2, ctr)
    }
}

private inline fun androidx.compose.ui.graphics.drawscope.DrawScope.clipPathCircle(c: Offset, r: Float, block: androidx.compose.ui.graphics.drawscope.DrawScope.() -> Unit) {
    // DrawScope.clipPath is unavailable in this Compose build; clip via the canvas directly.
    val p = androidx.compose.ui.graphics.Path().apply { addOval(androidx.compose.ui.geometry.Rect(c.x - r, c.y - r, c.x + r, c.y + r)) }
    drawContext.canvas.save()
    drawContext.canvas.clipPath(p, androidx.compose.ui.graphics.ClipOp.Intersect)
    block()
    drawContext.canvas.restore()
}

// ---- skeletons (components/Skeleton.tsx + SkeletonLoaders.tsx) -------------------------------------------------------

@Composable
fun Skeleton(modifier: Modifier = Modifier, radius: Dp = 4.dp) {
    val a by rememberInfiniteTransition().animateFloat(.3f, .7f, infiniteRepeatable(tween(800), RepeatMode.Reverse))
    Box(modifier.alpha(a).clip(RoundedCornerShape(radius)).background(Drift.colors.border))
}

@Composable
fun TrackItemSkeleton() = Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
    Skeleton(Modifier.size(48.dp), 6.dp)
    Column(Modifier.weight(1f)) {
        Skeleton(Modifier.fillMaxWidth(.8f).height(16.dp)); Spacer(Modifier.height(6.dp)); Skeleton(Modifier.fillMaxWidth(.6f).height(12.dp))
    }
}

@Composable
fun HorizontalTrackListSkeleton() = Row(Modifier.padding(horizontal = Spacing.md), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
    repeat(3) { Column(Modifier.width(100.dp)) {
        Skeleton(Modifier.size(100.dp), 6.dp); Spacer(Modifier.height(Spacing.xs)); Skeleton(Modifier.width(90.dp).height(14.dp)); Spacer(Modifier.height(4.dp)); Skeleton(Modifier.width(70.dp).height(12.dp))
    } }
}

@Composable
fun CollectionDetailsSkeleton() = Column(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxWidth().padding(vertical = Spacing.lg, horizontal = Spacing.md), horizontalAlignment = Alignment.CenterHorizontally) {
        Skeleton(Modifier.size(200.dp), 8.dp); Spacer(Modifier.height(Spacing.md))
        Skeleton(Modifier.width(180.dp).height(24.dp)); Spacer(Modifier.height(8.dp)); Skeleton(Modifier.width(120.dp).height(16.dp))
    }
    repeat(5) { TrackItemSkeleton() }
}

@Composable
fun QuickPlaySkeleton() = Column(Modifier.fillMaxWidth()) {
    Column(Modifier.fillMaxWidth().padding(top = 50.dp, bottom = Spacing.lg), horizontalAlignment = Alignment.CenterHorizontally) {
        Skeleton(Modifier.size(200.dp), 12.dp); Spacer(Modifier.height(Spacing.lg))
        Skeleton(Modifier.width(180.dp).height(24.dp)); Spacer(Modifier.height(8.dp)); Skeleton(Modifier.width(120.dp).height(16.dp))
    }
    Spacer(Modifier.height(Spacing.xl)); Skeleton(Modifier.padding(start = Spacing.md).width(120.dp).height(20.dp)); Spacer(Modifier.height(Spacing.sm)); HorizontalTrackListSkeleton()
}

/** onEndReached equivalent for LazyColumn (original FlatList onEndReachedThreshold ≈ 0.3–0.5). */
@Composable
fun EndReached(state: androidx.compose.foundation.lazy.LazyListState, onEnd: () -> Unit) {
    val cb by rememberUpdatedState(onEnd)
    val near by remember { derivedStateOf { val i = state.layoutInfo; i.totalItemsCount > 0 && (i.visibleItemsInfo.lastOrNull()?.index ?: 0) >= i.totalItemsCount - 4 } }
    LaunchedEffect(near) { if (near) cb() }
}

@Composable
fun EndReachedGrid(state: androidx.compose.foundation.lazy.grid.LazyGridState, onEnd: () -> Unit) {
    val cb by rememberUpdatedState(onEnd)
    val near by remember { derivedStateOf { val i = state.layoutInfo; i.totalItemsCount > 0 && (i.visibleItemsInfo.lastOrNull()?.index ?: 0) >= i.totalItemsCount - 6 } }
    LaunchedEffect(near) { if (near) cb() }
}

@Composable
fun Modifier.systemBarsPaddingCompat(): Modifier = this.windowInsetsPadding(WindowInsets.systemBars)

@Composable
fun Modifier.topBarsPaddingCompat(): Modifier = this.windowInsetsPadding(WindowInsets.systemBars.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
