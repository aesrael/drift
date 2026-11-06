package com.drift.app.api

import com.drift.app.data.LrcParser
import com.drift.app.model.*
import com.drift.app.source.MusicSource
import kotlinx.serialization.json.*

/** Standard / OpenSubsonic only. No server extensions. */
class SubsonicSource(
    private val client: SubsonicClient,
    private val maxBitRate: () -> Int,
) : MusicSource {

    val isConfigured get() = client.isConfigured

    override fun owns(id: String) = !isLocalId(id)

    suspend fun ping(): ServerInfo {
        val r = client.call("ping")
        return ServerInfo(
            apiVersion = r.str("version") ?: "?",
            type = r.str("type"),
            serverVersion = r.str("serverVersion"),
            openSubsonic = r.bool("openSubsonic"),
        )
    }

    override suspend fun albumList(
        type: AlbumListType, size: Int, offset: Int, genre: String?, fromYear: Int?, toYear: Int?,
    ): List<Album> {
        val p = mutableListOf("type" to type.api, "size" to size.toString(), "offset" to offset.toString())
        if (type == AlbumListType.ByGenre && genre != null) p += "genre" to genre
        if (type == AlbumListType.ByYear) {
            p += "fromYear" to (fromYear ?: 0).toString()
            p += "toYear" to (toYear ?: 3000).toString()
        }
        return client.call("getAlbumList2", p).obj("albumList2")?.get("album").items().mapNotNull { it.toAlbum() }
    }

    override suspend fun album(id: String): AlbumDetail {
        val a = client.call("getAlbum", listOf("id" to id)).obj("album") ?: error("Album not found")
        val songs = a["song"].items().mapNotNull { it.toSong() }
        return AlbumDetail(a.toAlbum()!!, songs)
    }

    override suspend fun artists(): List<Artist> =
        client.call("getArtists").obj("artists")?.get("index").items()
            .flatMap { it["artist"].items() }.mapNotNull { it.toArtist() }

    override suspend fun artist(id: String): ArtistDetail {
        val a = client.call("getArtist", listOf("id" to id)).obj("artist") ?: error("Artist not found")
        return ArtistDetail(a.toArtist()!!, a["album"].items().mapNotNull { it.toAlbum() })
    }

    override suspend fun song(id: String): Song =
        client.call("getSong", listOf("id" to id)).obj("song")?.toSong() ?: error("Song not found")

    override suspend fun search(query: String, songCount: Int, albumCount: Int, artistCount: Int): SearchResults {
        val r = client.call(
            "search3",
            listOf("query" to query, "songCount" to "$songCount", "albumCount" to "$albumCount", "artistCount" to "$artistCount"),
        ).obj("searchResult3")
        return SearchResults(
            songs = r?.get("song").items().mapNotNull { it.toSong() },
            albums = r?.get("album").items().mapNotNull { it.toAlbum() },
            artists = r?.get("artist").items().mapNotNull { it.toArtist() },
        )
    }

    override suspend fun randomSongs(size: Int, genre: String?): List<Song> {
        val p = mutableListOf("size" to "$size")
        if (genre != null) p += "genre" to genre
        return client.call("getRandomSongs", p).obj("randomSongs")?.get("song").items().mapNotNull { it.toSong() }
    }

    override suspend fun songsByGenre(genre: String, count: Int, offset: Int): List<Song> =
        client.call("getSongsByGenre", listOf("genre" to genre, "count" to "$count", "offset" to "$offset"))
            .obj("songsByGenre")?.get("song").items().mapNotNull { it.toSong() }

    override suspend fun genres(): List<Genre> =
        client.call("getGenres").obj("genres")?.get("genre").items().mapNotNull {
            val name = it.str("value") ?: it.str("name") ?: return@mapNotNull null
            Genre(name, it.int("songCount"), it.int("albumCount"))
        }

    override suspend fun topSongs(artistName: String, count: Int): List<Song> =
        client.call("getTopSongs", listOf("artist" to artistName, "count" to "$count"))
            .obj("topSongs")?.get("song").items().mapNotNull { it.toSong() }

    override suspend fun starred(): StarredItems {
        val r = client.call("getStarred2").obj("starred2")
        return StarredItems(
            songs = r?.get("song").items().mapNotNull { it.toSong() },
            albums = r?.get("album").items().mapNotNull { it.toAlbum() },
            artists = r?.get("artist").items().mapNotNull { it.toArtist() },
        )
    }

    override suspend fun setStarred(kind: StarKind, id: String, starred: Boolean) {
        val key = when (kind) { StarKind.Song -> "id"; StarKind.Album -> "albumId"; StarKind.Artist -> "artistId" }
        client.call(if (starred) "star" else "unstar", listOf(key to id))
    }

    override suspend fun playlists(): List<Playlist> =
        client.call("getPlaylists").obj("playlists")?.get("playlist").items().mapNotNull { it.toPlaylist() }

    override suspend fun playlist(id: String): Playlist =
        client.call("getPlaylist", listOf("id" to id)).obj("playlist")?.toPlaylist() ?: error("Playlist not found")

    override suspend fun createPlaylist(name: String, songIds: List<String>): Playlist {
        val r = client.call("createPlaylist", listOf("name" to name) + songIds.map { "songId" to it })
        // Subsonic < 1.14 returns an empty body; resolve by name.
        return r.obj("playlist")?.toPlaylist() ?: playlists().last { it.name == name }
    }

    override suspend fun addToPlaylist(playlistId: String, songIds: List<String>) {
        client.call("updatePlaylist", listOf("playlistId" to playlistId) + songIds.map { "songIdToAdd" to it })
    }

    override suspend fun removeFromPlaylist(playlistId: String, indexes: List<Int>) {
        client.call("updatePlaylist", listOf("playlistId" to playlistId) + indexes.map { "songIndexToRemove" to "$it" })
    }

    override suspend fun renamePlaylist(id: String, name: String) {
        client.call("updatePlaylist", listOf("playlistId" to id, "name" to name))
    }

    override suspend fun deletePlaylist(id: String) {
        client.call("deletePlaylist", listOf("id" to id))
    }

    override suspend fun lyrics(song: Song): Lyrics? {
        // OpenSubsonic: structured, optionally time-synced lyrics.
        try {
            val list = client.call("getLyricsBySongId", listOf("id" to song.id))
                .obj("lyricsList")?.get("structuredLyrics").items()
            val best = list.firstOrNull { it.bool("synced") } ?: list.firstOrNull()
            if (best != null) {
                val synced = best.bool("synced")
                val lines = best["line"].items().map { LyricLine(if (synced) it.long("start") else null, it.str("value") ?: "") }
                if (lines.isNotEmpty()) return Lyrics(lines, synced)
            }
        } catch (e: SubsonicException) {
            if (e.code == SubsonicException.NETWORK) throw e
            // 0 / 10 / 70: unsupported or not found → classic endpoint below.
        }
        // Classic endpoint: plain text, sometimes containing LRC timestamps.
        val text = client.call("getLyrics", listOf("artist" to song.artist, "title" to song.title))
            .obj("lyrics")?.str("value") ?: return null
        return LrcParser.parse(text)
    }

    override suspend fun scrobble(songId: String, timeMs: Long, submission: Boolean) {
        client.call("scrobble", listOf("id" to songId, "time" to "$timeMs", "submission" to "$submission"))
    }

    override fun coverArtUrl(coverArtId: String, size: Int): String? =
        if (!client.isConfigured || isLocalId(coverArtId)) null
        else client.url("getCoverArt", listOf("id" to coverArtId, "size" to "$size"))

    override fun streamUrl(song: Song, maxBitRate: Int): String? {
        if (isLocalId(song.id) || !client.isConfigured) return null
        val p = mutableListOf("id" to song.id, "estimateContentLength" to "true")
        val br = if (maxBitRate > 0) maxBitRate else this.maxBitRate()
        if (br > 0) p += "maxBitRate" to "$br"
        return client.url("stream", p)
    }

    /** Original file (used for offline downloads). */
    fun downloadUrl(song: Song): String = client.url("download", listOf("id" to song.id))
}
