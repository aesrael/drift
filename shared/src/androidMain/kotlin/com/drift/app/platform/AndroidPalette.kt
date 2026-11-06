package com.drift.app.ui

import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.drift.app.platform.AndroidContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

actual suspend fun loadPixels(url: String, size: Int): IntArray? = withContext(Dispatchers.Default) {
    val ctx = AndroidContext.app
    val req = ImageRequest.Builder(ctx).data(url).size(size, size).allowHardware(false).build()
    val res = SingletonImageLoader.get(ctx).execute(req) as? SuccessResult ?: return@withContext null
    val bmp = res.image.toBitmap(size, size)
    IntArray(size * size).also { bmp.getPixels(it, 0, size, 0, 0, size, size) }
}
