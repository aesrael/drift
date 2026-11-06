package com.drift.app.source

import com.drift.app.api.SubsonicSource
import com.drift.app.data.AppPrefs
import com.drift.app.data.SourceMode
import com.drift.app.model.*
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

/**
 * What the UI actually uses. Decides which underlying sources are active
 * (server, device, or both when "Show music on this device" is on) and merges results.
 * If one source fails (e.g. offline) the other still answers.
 */
class SourceRouter(
    val remote: SubsonicSource,
    val local: LocalSource,
    private val prefs: AppPrefs,
) : MusicSource {

    val remoteActive get() = prefs.mode.value == SourceMode.Server && remote.isConfigured
    val localActive get() = prefs.mode.value == SourceMode.DeviceOnly || (prefs.mode.value == SourceMode.Server && prefs.showDeviceMusic.value)

    override fun owns(id: String) = true
    private fun route(id: String): MusicSource = if (isLocalId(id)) local else remote

    private suspend fun <T> gather(r: (suspend () -> T)?, l: (suspend () -> T)?, merge: (T, T) -> T): T = coroutineScope {
        val rd = r?.let { f -> async { runCatching { f() } } }
        val ld = l?.let { f -> async { runCatching { f() } } }
        val rr = rd?.await()
        val lr = ld?.await()
        when {
            rr != null && lr != null -> when {
                rr.isSuccess && lr.isSuccess -> merge(rr.getOrThrow(), lr.getOrThrow())
                rr.isSuccess -> rr.getOrThrow()
                lr.isSuccess -> lr.getOrThrow()
                else -> throw rr.exceptionOrNull()!!
            }
            rr != null -> rr.getOrThrow()
            lr != null -> lr.getOrThrow()
            else -> throw IllegalStateException("No music source is enabled")
        }
    }

    private fun <T> remoteIf(f: suspend () -> T): (suspend () -> T)? = if (remoteActive) f else null
    private fun <T> localIf(f: suspend () -> T): (suspend () -> T)? = if (localActive) f else null

    override suspend fun albumList(type: AlbumListType, size: Int, offset: Int, genre: String?, fromYear: Int?, toYear: Int?): List<Album> {
        val both = remoteActive && localActive
        return gather(
            remoteIf { remote.albumList(type, size, offset, genre, fromYear, toYear) },
            // Merged mode: device albums join the first page only (server paging stays exact).
            localIf {
                when {
                    !both -> local.albumList(type, size, offset, genre, fromYear, toYear)
                    offset == 0 -> local.albumList(type, minOf(size, 12), 0, genre, fromYear, toYear)
                    else -> emptyList()
                }
            },
        ) { a, b -> a + b }
    }

    override suspend fun album(id: String) = route(id).album(id)
    override suspend fun artist(id: String) = route(id).artist(id)
    override suspend fun song(id: String) = route(id).song(id)

    override suspend fun artists(): List<Artist> =
        gather(remoteIf { remote.artists() }, localIf { local.artists() }) { a, b -> (a + b).sortedBy { it.name.lowercase() } }

    override suspend fun search(query: String, songCount: Int, albumCount: Int, artistCount: Int): SearchResults =
        gather(
            remoteIf { remote.search(query, songCount, albumCount, artistCount) },
            localIf { local.search(query, songCount, albumCount, artistCount) },
        ) { a, b -> SearchResults(a.songs + b.songs, a.albums + b.albums, a.artists + b.artists) }

    override suspend fun randomSongs(size: Int, genre: String?): List<Song> =
        gather(remoteIf { remote.randomSongs(size, genre) }, localIf { local.randomSongs(size, genre) }) { a, b -> (a + b).shuffled().take(size) }

    override suspend fun songsByGenre(genre: String, count: Int, offset: Int): List<Song> =
        gather(remoteIf { remote.songsByGenre(genre, count, offset) }, localIf { local.songsByGenre(genre, count, offset) }) { a, b -> a + b }

    override suspend fun genres(): List<Genre> =
        gather(remoteIf { remote.genres() }, localIf { local.genres() }) { a, b ->
            (a + b).groupBy { it.name.lowercase() }.values.map { g -> Genre(g.first().name, g.sumOf { it.songCount }, g.sumOf { it.albumCount }) }
                .sortedBy { it.name.lowercase() }
        }

    override suspend fun topSongs(artistName: String, count: Int): List<Song> =
        gather(remoteIf { remote.topSongs(artistName, count) }, localIf { local.topSongs(artistName, count) }) { a, b -> a + b }

    override suspend fun starred(): StarredItems =
        gather(remoteIf { remote.starred() }, localIf { local.starred() }) { a, b ->
            StarredItems(a.songs + b.songs, a.albums + b.albums, a.artists + b.artists)
        }

    override suspend fun setStarred(kind: StarKind, id: String, starred: Boolean) = route(id).setStarred(kind, id, starred)

    override suspend fun playlists(): List<Playlist> =
        gather(remoteIf { remote.playlists() }, localIf { local.playlists() }) { a, b -> a + b }

    override suspend fun playlist(id: String) = route(id).playlist(id)

    override suspend fun createPlaylist(name: String, songIds: List<String>): Playlist {
        val target = songIds.firstOrNull()?.let(::route) ?: if (remoteActive) remote else local
        if (songIds.any { route(it) !== target }) throw UnsupportedOperationException(MIX_ERROR)
        return target.createPlaylist(name, songIds)
    }

    override suspend fun addToPlaylist(playlistId: String, songIds: List<String>) {
        val target = route(playlistId)
        if (songIds.any { route(it) !== target }) throw UnsupportedOperationException(MIX_ERROR)
        target.addToPlaylist(playlistId, songIds)
    }

    override suspend fun removeFromPlaylist(playlistId: String, indexes: List<Int>) = route(playlistId).removeFromPlaylist(playlistId, indexes)
    override suspend fun renamePlaylist(id: String, name: String) = route(id).renamePlaylist(id, name)
    override suspend fun deletePlaylist(id: String) = route(id).deletePlaylist(id)

    override suspend fun lyrics(song: Song) = route(song.id).lyrics(song)
    override suspend fun scrobble(songId: String, timeMs: Long, submission: Boolean) = route(songId).scrobble(songId, timeMs, submission)

    override fun coverArtUrl(coverArtId: String, size: Int) = route(coverArtId).coverArtUrl(coverArtId, size)
    override fun streamUrl(song: Song, maxBitRate: Int) = route(song.id).streamUrl(song, maxBitRate)

    private companion object {
        const val MIX_ERROR = "Device songs and server songs can't share a playlist"
    }
}
