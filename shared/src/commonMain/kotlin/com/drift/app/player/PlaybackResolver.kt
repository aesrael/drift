package com.drift.app.player

import com.drift.app.data.DownloadManager
import com.drift.app.model.Song
import com.drift.app.source.SourceRouter

/** Decides how a song is actually opened: downloaded file → device file → server stream. */
class PlaybackResolver(
    private val router: SourceRouter,
    private val downloads: DownloadManager,
) {
    fun uriFor(song: Song): String? =
        downloads.pathFor(song.id)?.let { "file://$it" }
            ?: song.localUri
            ?: router.streamUrl(song)

    fun item(song: Song): QueueItem? {
        val uri = uriFor(song) ?: return null
        return QueueItem(song, uri, song.coverArt?.let { router.coverArtUrl(it, 512) })
    }

    fun items(songs: List<Song>): List<QueueItem> = songs.mapNotNull(::item)
}
