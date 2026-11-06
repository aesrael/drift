package com.drift.app.source

import com.drift.app.model.*

/**
 * The single contract the whole app talks to. Shapes mirror the Subsonic API so a server maps 1:1
 * (SubsonicSource) and the on-device library can be exposed through the same surface (LocalSource).
 * IDs from device sources are prefixed with "local:" so a router can dispatch by id.
 */
interface MusicSource {
    fun owns(id: String): Boolean

    suspend fun albumList(
        type: AlbumListType, size: Int = 20, offset: Int = 0,
        genre: String? = null, fromYear: Int? = null, toYear: Int? = null,
    ): List<Album>
    suspend fun album(id: String): AlbumDetail
    suspend fun artists(): List<Artist>
    suspend fun artist(id: String): ArtistDetail
    suspend fun song(id: String): Song
    suspend fun search(query: String, songCount: Int = 30, albumCount: Int = 20, artistCount: Int = 10): SearchResults
    suspend fun randomSongs(size: Int = 30, genre: String? = null): List<Song>
    suspend fun songsByGenre(genre: String, count: Int = 50, offset: Int = 0): List<Song>
    suspend fun genres(): List<Genre>
    suspend fun topSongs(artistName: String, count: Int = 20): List<Song>

    suspend fun starred(): StarredItems
    suspend fun setStarred(kind: StarKind, id: String, starred: Boolean)

    suspend fun playlists(): List<Playlist>
    suspend fun playlist(id: String): Playlist
    suspend fun createPlaylist(name: String, songIds: List<String> = emptyList()): Playlist
    suspend fun addToPlaylist(playlistId: String, songIds: List<String>)
    suspend fun removeFromPlaylist(playlistId: String, indexes: List<Int>)
    suspend fun renamePlaylist(id: String, name: String)
    suspend fun deletePlaylist(id: String)

    suspend fun lyrics(song: Song): Lyrics?
    suspend fun scrobble(songId: String, timeMs: Long, submission: Boolean)

    /** URL (http(s) or a platform scheme such as devicecover://) for an image loader. */
    fun coverArtUrl(coverArtId: String, size: Int = 300): String?
    /** Network stream URL, or null for songs that play from [Song.localUri]. */
    fun streamUrl(song: Song, maxBitRate: Int = 0): String?
}
