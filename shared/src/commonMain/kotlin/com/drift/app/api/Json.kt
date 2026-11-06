package com.drift.app.api

import com.drift.app.model.*
import kotlinx.serialization.json.*

internal val SubsonicJson = Json { ignoreUnknownKeys = true; isLenient = true }

/** Subsonic JSON returns a bare object where a list of one is expected on some servers. */
internal fun JsonElement?.items(): List<JsonObject> = when (this) {
    is JsonArray -> mapNotNull { it as? JsonObject }
    is JsonObject -> listOf(this)
    else -> emptyList()
}

internal fun JsonObject.str(k: String): String? =
    (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.takeIf { it.isNotEmpty() }
internal fun JsonObject.int(k: String): Int = str(k)?.toDoubleOrNull()?.toInt() ?: 0
internal fun JsonObject.long(k: String): Long = str(k)?.toDoubleOrNull()?.toLong() ?: 0L
internal fun JsonObject.bool(k: String): Boolean = str(k)?.toBooleanStrictOrNull() ?: false
internal fun JsonObject.obj(k: String): JsonObject? = this[k] as? JsonObject

internal fun JsonObject.toSong(): Song? {
    val id = str("id") ?: return null
    if (bool("isDir") || bool("isVideo")) return null
    return Song(
        id = id,
        title = str("title") ?: str("name") ?: "Unknown",
        artist = str("artist") ?: "",
        album = str("album") ?: "",
        albumId = str("albumId"),
        artistId = str("artistId"),
        track = int("track"),
        disc = int("discNumber"),
        year = int("year"),
        genre = str("genre"),
        coverArt = str("coverArt") ?: str("albumId"),
        durationSec = int("duration"),
        bitRate = int("bitRate"),
        sizeBytes = long("size"),
        suffix = str("suffix"),
        starred = str("starred") != null,
    )
}

internal fun JsonObject.toAlbum(): Album? {
    val id = str("id") ?: return null
    return Album(
        id = id,
        name = str("name") ?: str("title") ?: str("album") ?: "Unknown album",
        artist = str("artist") ?: "",
        artistId = str("artistId"),
        coverArt = str("coverArt") ?: id,
        songCount = int("songCount"),
        durationSec = int("duration"),
        year = int("year"),
        genre = str("genre"),
        starred = str("starred") != null,
        created = str("created"),
        playCount = long("playCount"),
    )
}

internal fun JsonObject.toArtist(): Artist? {
    val id = str("id") ?: return null
    return Artist(
        id = id,
        name = str("name") ?: "Unknown artist",
        coverArt = str("coverArt"),
        albumCount = int("albumCount"),
        starred = str("starred") != null,
    )
}

internal fun JsonObject.toPlaylist(): Playlist? {
    val id = str("id") ?: return null
    return Playlist(
        id = id,
        name = str("name") ?: "Playlist",
        comment = str("comment"),
        owner = str("owner"),
        songCount = int("songCount"),
        durationSec = int("duration"),
        coverArt = str("coverArt"),
        isPublic = bool("public"),
        songs = this["entry"].items().mapNotNull { it.toSong() },
    )
}
