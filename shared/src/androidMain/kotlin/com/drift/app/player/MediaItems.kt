package com.drift.app.player

import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.drift.app.model.Song
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val EXTRA_SONG = "drift.song"

/** The whole Song rides along in MediaItem extras, so the UI can rebuild its model from the native queue. */
internal fun QueueItem.toMediaItem(): MediaItem =
    MediaItem.Builder()
        .setMediaId(song.id)
        .setUri(uri)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(song.title).setArtist(song.artist).setAlbumTitle(song.album)
                .setArtworkUri(artworkUrl?.let(Uri::parse))
                .setIsPlayable(true).setIsBrowsable(false)
                .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                .setExtras(Bundle().apply { putString(EXTRA_SONG, Json.encodeToString(song)) })
                .build(),
        )
        .build()

internal fun MediaItem.toSong(): Song =
    mediaMetadata.extras?.getString(EXTRA_SONG)?.let { runCatching { Json.decodeFromString<Song>(it) }.getOrNull() }
        ?: Song(id = mediaId, title = mediaMetadata.title?.toString() ?: "Unknown", artist = mediaMetadata.artist?.toString() ?: "")
