package com.drift.app.ui

import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

// ---- colour maths: ports of mixHex / ensureContrast / contrastRatio / getReadableTextColor --------------------------------

fun mix(a: Color, b: Color, ratio: Float): Color {
    val t = ratio.coerceIn(0f, 1f)
    return Color(a.red * (1 - t) + b.red * t, a.green * (1 - t) + b.green * t, a.blue * (1 - t) + b.blue * t, 1f)
}

private fun lin(v: Float) = if (v <= 0.03928f) v / 12.92f else ((v + 0.055f) / 1.055f).toDouble().pow(2.4).toFloat()
private fun relLum(c: Color) = 0.2126f * lin(c.red) + 0.7152f * lin(c.green) + 0.0722f * lin(c.blue)

fun contrastRatio(fg: Color, bg: Color): Float {
    val l1 = relLum(fg); val l2 = relLum(bg)
    return (max(l1, l2) + 0.05f) / (min(l1, l2) + 0.05f)
}

fun ensureContrast(candidate: Color, background: Color, min: Float, fallback: Color) =
    if (contrastRatio(candidate, background) >= min) candidate else fallback

fun readableOn(bg: Color) = if (contrastRatio(Color.White, bg) >= 3f) Color.White else Color(0xFF111111)

// ---- palette extraction (replacement for react-native-image-colors) --------------------------------------------------

/** Platform: decode [url] (via the shared Coil loader) to ~[size]² ARGB pixels. */
expect suspend fun loadPixels(url: String, size: Int = 48): IntArray?

class ImagePalette(val dominant: Color, val vibrant: Color, val muted: Color, val darkVibrant: Color, val average: Color)

private class Bucket(var n: Int = 0, var r: Long = 0, var g: Long = 0, var b: Long = 0) {
    fun color() = Color((r / n).toInt(), (g / n).toInt(), (b / n).toInt())
}

private fun hsl(c: Color): FloatArray {
    val mx = max(c.red, max(c.green, c.blue)); val mn = min(c.red, min(c.green, c.blue))
    val l = (mx + mn) / 2f
    val s = if (mx == mn) 0f else (mx - mn) / (1f - kotlin.math.abs(2f * l - 1f))
    return floatArrayOf(0f, s, l)
}

fun computePalette(px: IntArray): ImagePalette? {
    if (px.isEmpty()) return null
    val buckets = HashMap<Int, Bucket>()
    var ar = 0L; var ag = 0L; var ab = 0L
    for (p in px) {
        val r = (p shr 16) and 0xFF; val g = (p shr 8) and 0xFF; val b = p and 0xFF
        ar += r; ag += g; ab += b
        val key = ((r shr 4) shl 8) or ((g shr 4) shl 4) or (b shr 4)
        val bk = buckets.getOrPut(key) { Bucket() }
        bk.n++; bk.r += r; bk.g += g; bk.b += b
    }
    val avg = Color((ar / px.size).toInt(), (ag / px.size).toInt(), (ab / px.size).toInt())
    val all = buckets.values.map { it.color() to it.n }
    val dominant = all.maxByOrNull { it.second }?.first ?: avg
    fun pick(minS: Float, maxS: Float, minL: Float, maxL: Float, weightSat: Boolean): Color? =
        all.filter { (c, _) -> val h = hsl(c); h[1] in minS..maxS && h[2] in minL..maxL }
            .maxByOrNull { (c, n) -> n * (if (weightSat) 0.3f + hsl(c)[1] else 1f) }?.first
    val vibrant = pick(0.35f, 1f, 0.3f, 0.7f, true) ?: pick(0.2f, 1f, 0.2f, 0.8f, true) ?: dominant
    val muted = pick(0.05f, 0.4f, 0.3f, 0.7f, false) ?: dominant
    val darkVibrant = pick(0.35f, 1f, 0.1f, 0.4f, true) ?: mix(vibrant, Color.Black, .45f)
    return ImagePalette(dominant, vibrant, muted, darkVibrant, avg)
}

private val paletteCache = HashMap<String, ImagePalette?>()

@Composable
fun rememberPalette(url: String?): ImagePalette? {
    var palette by remember(url) { mutableStateOf(url?.let { paletteCache[it] }) }
    LaunchedEffect(url) {
        if (url == null) { palette = null; return@LaunchedEffect }
        if (paletteCache.containsKey(url)) { palette = paletteCache[url]; return@LaunchedEffect }
        val p = runCatching { loadPixels(url)?.let(::computePalette) }.getOrNull()
        paletteCache[url] = p; palette = p
    }
    return palette
}
