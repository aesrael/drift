@file:OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)

package com.drift.app.platform

import coil3.ComponentRegistry
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.Uri
import coil3.decode.DataSource
import coil3.decode.ImageSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.SourceFetchResult
import coil3.request.Options
import com.drift.app.source.DeviceAudio
import com.drift.app.source.DeviceMediaScanner
import kotlinx.cinterop.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okio.Buffer
import okio.FileSystem
import platform.CoreGraphics.CGSizeMake
import platform.Foundation.*
import platform.MediaPlayer.*
import platform.UIKit.UIImageJPEGRepresentation
import platform.posix.memcpy
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

fun NSData.toByteArray(): ByteArray {
    val n = length.toInt()
    val out = ByteArray(n)
    if (n > 0) out.usePinned { memcpy(it.addressOf(0), bytes, length) }
    return out
}

/** JPEG artwork for a library item, by persistent id. */
fun deviceArtJpeg(persistentId: String, side: Double = 600.0): NSData? {
    val id = persistentId.toULongOrNull() ?: return null
    val q = MPMediaQuery()
    q.addFilterPredicate(MPMediaPropertyPredicate.predicateWithValue(NSNumber(unsignedLongLong = id), forProperty = MPMediaItemPropertyPersistentID))
    val item = q.items?.firstOrNull() as? MPMediaItem ?: return null
    val img = item.artwork?.imageWithSize(CGSizeMake(side, side)) ?: return null
    return UIImageJPEGRepresentation(img, 0.85)
}

class IosDeviceMediaScanner : DeviceMediaScanner {
    override fun hasPermission() = MPMediaLibrary.authorizationStatus() == MPMediaLibraryAuthorizationStatusAuthorized

    override suspend fun requestPermission(): Boolean {
        if (hasPermission()) return true
        return suspendCoroutine { cont -> MPMediaLibrary.requestAuthorization { status -> cont.resume(status == MPMediaLibraryAuthorizationStatusAuthorized) } }
    }

    override suspend fun scan(): List<DeviceAudio> = withContext(Dispatchers.Default) {
        val items = MPMediaQuery.songsQuery().items ?: emptyList<Any?>()
        items.mapNotNull { it as? MPMediaItem }.mapNotNull { m ->
            // assetURL is null for cloud-only and DRM-protected items: they can't be played by AVPlayer anyway.
            val url = m.assetURL?.absoluteString ?: return@mapNotNull null
            DeviceAudio(
                id = m.persistentID.toString(),
                title = m.title ?: "Unknown title",
                artist = m.artist ?: "Unknown artist",
                album = m.albumTitle ?: "Unknown album",
                albumId = m.albumPersistentID.toString(),
                artistId = m.artistPersistentID.toString(),
                durationMs = (m.playbackDuration * 1000).toLong(),
                track = m.albumTrackNumber.toInt(),
                disc = m.discNumber.toInt(),
                year = m.releaseDate?.let { (1970 + it.timeIntervalSince1970 / 31_556_952.0).toInt() } ?: 0,
                genre = m.genre,
                uri = url,
                dateAddedSec = m.dateAdded.timeIntervalSince1970.toLong(),
                sizeBytes = 0,
                suffix = null,
            )
        }
    }
}

private class DeviceCoverFetcher(private val id: String) : Fetcher {
    override suspend fun fetch(): FetchResult? {
        val bytes = withContext(Dispatchers.Default) { deviceArtJpeg(id)?.toByteArray() } ?: return null
        return SourceFetchResult(ImageSource(Buffer().write(bytes), FileSystem.SYSTEM), null, DataSource.DISK)
    }
}

actual fun ComponentRegistry.Builder.addPlatformComponents(context: PlatformContext) {
    add(object : Fetcher.Factory<Uri> {
        override fun create(data: Uri, options: Options, imageLoader: ImageLoader): Fetcher? =
            if (data.scheme == "devicecover") data.authority?.let { DeviceCoverFetcher(it) } else null
    })
}
