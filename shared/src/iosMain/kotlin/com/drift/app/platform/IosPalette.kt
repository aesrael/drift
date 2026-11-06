package com.drift.app.ui

import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.toBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jetbrains.skia.ColorAlphaType
import org.jetbrains.skia.ColorType
import org.jetbrains.skia.ImageInfo

actual suspend fun loadPixels(url: String, size: Int): IntArray? = withContext(Dispatchers.Default) {
    val ctx = PlatformContext.INSTANCE
    val req = ImageRequest.Builder(ctx).data(url).build()
    val res = SingletonImageLoader.get(ctx).execute(req) as? SuccessResult ?: return@withContext null
    val bmp = res.image.toBitmap(size, size)
    val bytes = bmp.readPixels(ImageInfo(size, size, ColorType.RGBA_8888, ColorAlphaType.PREMUL), size * 4) ?: return@withContext null
    IntArray(size * size) { i ->
        val o = i * 4
        (0xFF shl 24) or ((bytes[o].toInt() and 0xFF) shl 16) or ((bytes[o + 1].toInt() and 0xFF) shl 8) or (bytes[o + 2].toInt() and 0xFF)
    }
}
