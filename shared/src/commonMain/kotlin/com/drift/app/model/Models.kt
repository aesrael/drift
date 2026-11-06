package com.drift.app.model

import kotlinx.serialization.Serializable

const val LOCAL_PREFIX = "local:"
fun isLocalId(id: String) = id.startsWith(LOCAL_PREFIX)

@Serializable
data class Song(
    val id: String,
    val title: String,
    val artist: String = "",
    val album: String = "",
    val albumId: String? = null,
    val artistId: String? = null,
    val track: Int = 0,
    val disc: Int = 0,
    val year: Int = 0,
    val genre: String? = null,
    val coverArt: String? = null,
    val durationSec: Int = 0,
    val bitRate: Int = 0,
    val sizeBytes: Long = 0,
    val suffix: String? = null,
    val starred: Boolean = false,
    /** Direct playable location for songs not served by a Subsonic server (device files). */
    val localUri: String? = null,
) {
    val isLocal get() = isLocalId(id)
}

data class Album(
    val id: String,
    val name: String,
    val artist: String = "",
    val artistId: String? = null,
    val coverArt: String? = null,
    val songCount: Int = 0,
    val durationSec: Int = 0,
    val year: Int = 0,
    val genre: String? = null,
    val starred: Boolean = false,
    val created: String? = null,
    val playCount: Long = 0,
) {
    val isLocal get() = isLocalId(id)
}

data class Artist(
    val id: String,
    val name: String,
    val coverArt: String? = null,
    val albumCount: Int = 0,
    val starred: Boolean = false,
)

data class Playlist(
    val id: String,
    val name: String,
    val comment: String? = null,
    val owner: String? = null,
    val songCount: Int = 0,
    val durationSec: Int = 0,
    val coverArt: String? = null,
    val isPublic: Boolean = false,
    val songs: List<Song> = emptyList(),
) {
    val isLocal get() = isLocalId(id)
}

data class Genre(val name: String, val songCount: Int = 0, val albumCount: Int = 0)
data class AlbumDetail(val album: Album, val songs: List<Song>)
data class ArtistDetail(val artist: Artist, val albums: List<Album>)
data class SearchResults(
    val songs: List<Song> = emptyList(),
    val albums: List<Album> = emptyList(),
    val artists: List<Artist> = emptyList(),
)
data class StarredItems(
    val songs: List<Song> = emptyList(),
    val albums: List<Album> = emptyList(),
    val artists: List<Artist> = emptyList(),
)
data class LyricLine(val startMs: Long?, val text: String)
data class Lyrics(val lines: List<LyricLine>, val synced: Boolean)
data class ServerInfo(
    val apiVersion: String,
    val type: String? = null,
    val serverVersion: String? = null,
    val openSubsonic: Boolean = false,
)

/** Names are the standard Subsonic `getAlbumList2` types. */
enum class AlbumListType(val api: String, val title: String) {
    Recent("recent", "Recently played"),
    Newest("newest", "Newly added"),
    Frequent("frequent", "Most played"),
    Random("random", "Random picks"),
    Starred("starred", "Favourite albums"),
    ByName("alphabeticalByName", "A–Z"),
    ByArtist("alphabeticalByArtist", "By artist"),
    ByYear("byYear", "By year"),
    ByGenre("byGenre", "By genre"),
}

enum class StarKind { Song, Album, Artist }

class SubsonicException(val code: Int, message: String) : Exception(message) {
    companion object {
        const val NETWORK = -2
        const val NOT_SUBSONIC = -3
        const val NOT_SIGNED_IN = -1
    }
}
