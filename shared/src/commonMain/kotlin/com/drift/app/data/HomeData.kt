package com.drift.app.data

import com.drift.app.di.AppGraph
import com.drift.app.model.AlbumListType
import com.drift.app.model.Song
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

/**
 * The original Home used non-standard endpoints (getRecentSongs, getTopSongs without an artist).
 * These build equivalent song rows from standard getAlbumList2 + getAlbum, so any Subsonic server (and device music) works.
 */
object HomeData {
    private suspend fun songsOfAlbums(type: AlbumListType, albumCount: Int, limit: Int, fallback: AlbumListType? = null): List<Song> = coroutineScope {
        val r = AppGraph.router
        var albums = r.albumList(type, albumCount)
        if (albums.isEmpty() && fallback != null) albums = r.albumList(fallback, albumCount)
        albums.map { a -> async { runCatching { r.album(a.id).songs }.getOrDefault(emptyList()) } }
            .awaitAll().flatten().distinctBy { it.id }.take(limit)
    }

    suspend fun recentSongs(limit: Int = 40) = songsOfAlbums(AlbumListType.Recent, 10, limit, AlbumListType.Newest)
    suspend fun topSongs(limit: Int = 40) = songsOfAlbums(AlbumListType.Frequent, 10, limit, AlbumListType.Random)
}
