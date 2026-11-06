package com.drift.app.platform

import android.app.Application
import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.os.Build
import android.provider.MediaStore
import android.util.Size
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okio.Buffer
import okio.FileSystem
import java.io.ByteArrayOutputStream

class AndroidDeviceMediaScanner(private val app: Application) : DeviceMediaScanner {
    override fun hasPermission() = hasPermission(app, androidAudioPermission())
    override suspend fun requestPermission() = hasPermission() || PermissionBridge.request(androidAudioPermission())

    override suspend fun scan(): List<DeviceAudio> = withContext(Dispatchers.IO) {
        val base = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val cols = buildList {
            addAll(listOf(
                MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.ALBUM_ID, MediaStore.Audio.Media.ARTIST_ID,
                MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.TRACK, MediaStore.Audio.Media.YEAR,
                MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.SIZE, MediaStore.Audio.Media.DISPLAY_NAME,
            ))
            if (Build.VERSION.SDK_INT >= 30) add(MediaStore.Audio.Media.GENRE)
        }.toTypedArray()
        val out = ArrayList<DeviceAudio>()
        app.contentResolver.query(
            base, cols, "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} >= 10000", null,
            "${MediaStore.Audio.Media.TITLE} COLLATE NOCASE ASC",
        )?.use { c ->
            val iId = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val iTitle = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
            val iArtist = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            val iAlbum = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
            val iAlbumId = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
            val iArtistId = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST_ID)
            val iDur = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val iTrack = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)
            val iYear = c.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
            val iAdded = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
            val iSize = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
            val iName = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val iGenre = if (Build.VERSION.SDK_INT >= 30) c.getColumnIndex(MediaStore.Audio.Media.GENRE) else -1
            while (c.moveToNext()) {
                val id = c.getLong(iId)
                val rawTrack = c.getInt(iTrack)
                fun clean(s: String?, fallback: String) = s?.takeIf { it.isNotBlank() && it != "<unknown>" } ?: fallback
                out += DeviceAudio(
                    id = id.toString(),
                    title = clean(c.getString(iTitle), "Unknown title"),
                    artist = clean(c.getString(iArtist), "Unknown artist"),
                    album = clean(c.getString(iAlbum), "Unknown album"),
                    albumId = c.getLong(iAlbumId).toString(),
                    artistId = c.getLong(iArtistId).toString(),
                    durationMs = c.getLong(iDur),
                    track = rawTrack % 1000, disc = rawTrack / 1000,   // MediaStore packs disc*1000+track
                    year = c.getInt(iYear),
                    genre = if (iGenre >= 0) c.getString(iGenre)?.takeIf { it.isNotBlank() } else null,
                    uri = ContentUris.withAppendedId(base, id).toString(),
                    dateAddedSec = c.getLong(iAdded),
                    sizeBytes = c.getLong(iSize),
                    suffix = c.getString(iName)?.substringAfterLast('.', "")?.lowercase()?.ifBlank { null },
                )
            }
        }
        out
    }
}

/** Embedded artwork for a device song (falls back to the platform thumbnail on Android 10+). */
object DeviceArt {
    fun bytes(ctx: Context, audioId: String): ByteArray? {
        val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, audioId.toLongOrNull() ?: return null)
        val r = MediaMetadataRetriever()
        try {
            r.setDataSource(ctx, uri)
            r.embeddedPicture?.let { return it }
        } catch (_: Exception) {
        } finally {
            runCatching { r.release() }
        }
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                val bmp = ctx.contentResolver.loadThumbnail(uri, Size(600, 600), null)
                return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
            } catch (_: Exception) { }
        }
        return null
    }

    fun bitmap(ctx: Context, audioId: String): Bitmap? =
        bytes(ctx, audioId)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
}

private class DeviceCoverFetcher(private val ctx: Context, private val audioId: String) : Fetcher {
    override suspend fun fetch(): FetchResult? {
        val bytes = withContext(Dispatchers.IO) { DeviceArt.bytes(ctx, audioId) } ?: return null
        return SourceFetchResult(ImageSource(Buffer().write(bytes), FileSystem.SYSTEM), null, DataSource.DISK)
    }
}

actual fun ComponentRegistry.Builder.addPlatformComponents(context: PlatformContext) {
    add(object : Fetcher.Factory<Uri> {
        override fun create(data: Uri, options: Options, imageLoader: ImageLoader): Fetcher? =
            if (data.scheme == "devicecover") data.authority?.let { DeviceCoverFetcher(context, it) } else null
    })
}
