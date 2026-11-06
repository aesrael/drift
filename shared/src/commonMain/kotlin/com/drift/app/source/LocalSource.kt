package com.drift.app.source

import com.drift.app.data.nowMs
import com.drift.app.model.*
import com.russhwolf.settings.Settings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable private data class LocalPlaylist(val id: String, val name: String, val songIds: List<String>)
@Serializable private data class PlayStat(val count: Int = 0, val last: Long = 0)

/**
 * Adapter that exposes the phone's own audio library through the [MusicSource] contract
 * (Subsonic-shaped data), so every screen works unchanged for device music.
 * Stars, play counts and playlists for device songs live in app storage; files are never modified.
 */
class LocalSource(
    private val scanner: DeviceMediaScanner,
    private val store: Settings,
) : MusicSource {

    private val mutex = Mutex()
    private var scanned = false
    private var songs: List<Song> = emptyList()
    private var songById: Map<String, Song> = emptyMap()
    private var albums: List<Album> = emptyList()
    private var albumSongs: Map<String, List<Song>> = emptyMap()
    private var artists: List<Artist> = emptyList()
    private var addedAt: Map<String, Long> = emptyMap()   // song/album id → dateAdded

    private val _songCount = MutableStateFlow(0)
    val songCount: StateFlow<Int> = _songCount.asStateFlow()

    private var starredIds: MutableSet<String> = runCatching { Json.decodeFromString<List<String>>(store.getString("local_starred", "[]")).toMutableSet() }.getOrElse { mutableSetOf() }
    private var stats: MutableMap<String, PlayStat> = runCatching { Json.decodeFromString<Map<String, PlayStat>>(store.getString("local_stats", "{}")).toMutableMap() }.getOrElse { mutableMapOf() }
    private var playlistStore: MutableList<LocalPlaylist> = runCatching { Json.decodeFromString<List<LocalPlaylist>>(store.getString("local_playlists", "[]")).toMutableList() }.getOrElse { mutableListOf() }

    // Songs the user removed from the Drift list (files are never touched).
    private var hidden: MutableSet<String> = runCatching { Json.decodeFromString<List<String>>(store.getString("local_hidden", "[]")).toMutableSet() }.getOrElse { mutableSetOf() }
    private val _hiddenCount = MutableStateFlow(hidden.size)
    val hiddenCount: StateFlow<Int> = _hiddenCount.asStateFlow()

    suspend fun allSongs(): List<Song> { ensureScanned(); return songs.map(::withStar) }

    suspend fun hide(ids: Collection<String>) {
        hidden.addAll(ids); persistHidden(); ensureScanned(force = true)
    }

    suspend fun restoreHidden() {
        hidden.clear(); persistHidden(); ensureScanned(force = true)
    }

    private fun persistHidden() {
        store.putString("local_hidden", Json.encodeToString(hidden.toList())); _hiddenCount.value = hidden.size
    }

    fun hasPermission() = scanner.hasPermission()
    suspend fun requestPermission() = scanner.requestPermission()

    suspend fun ensureScanned(force: Boolean = false) = mutex.withLock {
        if (scanned && !force) return@withLock
        if (!scanner.hasPermission()) throw IllegalStateException("Permission to read music on this device was not granted")
        buildIndex(scanner.scan())
        scanned = true
    }

    private fun buildIndex(raw: List<DeviceAudio>) {
        val added = mutableMapOf<String, Long>()
        val all = raw.filter { "${LOCAL_PREFIX}s:${it.id}" !in hidden }.map { a ->
            val id = "${LOCAL_PREFIX}s:${a.id}"
            added[id] = a.dateAddedSec
            Song(
                id = id, title = a.title, artist = a.artist, album = a.album,
                albumId = "${LOCAL_PREFIX}al:${a.albumId}", artistId = "${LOCAL_PREFIX}ar:${a.artistId}",
                track = a.track, disc = a.disc, year = a.year, genre = a.genre,
                coverArt = "${LOCAL_PREFIX}art:${a.id}",
                durationSec = (a.durationMs / 1000).toInt(), sizeBytes = a.sizeBytes, suffix = a.suffix,
                starred = id in starredIds, localUri = a.uri,
            )
        }
        songs = all
        songById = all.associateBy { it.id }
        val grouped = all.groupBy { it.albumId!! }
        albumSongs = grouped.mapValues { (_, v) -> v.sortedWith(compareBy({ it.disc }, { it.track }, { it.title })) }
        albums = grouped.map { (id, list) ->
            val first = albumSongs.getValue(id).first()
            val distinctArtists = list.map { it.artist }.distinct()
            added[id] = list.maxOf { added[it.id] ?: 0L }
            Album(
                id = id, name = first.album.ifBlank { "Unknown album" },
                artist = if (distinctArtists.size > 1) "Various artists" else first.artist,
                artistId = if (distinctArtists.size > 1) null else first.artistId,
                coverArt = first.coverArt, songCount = list.size, durationSec = list.sumOf { it.durationSec },
                year = list.maxOf { it.year }, genre = first.genre, starred = id in starredIds,
                created = added[id].toString(), playCount = list.sumOf { (stats[it.id]?.count ?: 0).toLong() },
            )
        }
        artists = all.groupBy { it.artistId!! }.map { (id, list) ->
            Artist(id, list.first().artist, list.first().coverArt, list.mapNotNull { it.albumId }.distinct().size, id in starredIds)
        }.sortedBy { it.name.lowercase() }
        addedAt = added
        _songCount.value = all.size
    }

    override fun owns(id: String) = isLocalId(id)

    // ---- browsing -------------------------------------------------------------------------------------------------

    override suspend fun albumList(type: AlbumListType, size: Int, offset: Int, genre: String?, fromYear: Int?, toYear: Int?): List<Album> {
        ensureScanned()
        val sorted = when (type) {
            AlbumListType.Random -> albums.shuffled()
            AlbumListType.Newest -> albums.sortedByDescending { addedAt[it.id] ?: 0L }
            AlbumListType.Frequent -> albums.filter { it.playCount > 0 }.sortedByDescending { it.playCount }
            AlbumListType.Recent -> albums.mapNotNull { a ->
                val last = albumSongs[a.id].orEmpty().maxOfOrNull { stats[it.id]?.last ?: 0L } ?: 0L
                if (last > 0) a to last else null
            }.sortedByDescending { it.second }.map { it.first }
            AlbumListType.Starred -> albums.filter { it.id in starredIds }
            AlbumListType.ByName -> albums.sortedBy { it.name.lowercase() }
            AlbumListType.ByArtist -> albums.sortedBy { it.artist.lowercase() }
            AlbumListType.ByYear -> albums.filter { it.year in (fromYear ?: 0)..(toYear ?: 3000) }.sortedBy { it.year }
            AlbumListType.ByGenre -> albums.filter { it.genre.equals(genre, true) }
        }
        return sorted.drop(offset).take(size).map { it.copy(starred = it.id in starredIds) }
    }

    override suspend fun album(id: String): AlbumDetail {
        ensureScanned()
        val a = albums.firstOrNull { it.id == id } ?: error("Album not found")
        return AlbumDetail(a, albumSongs[id].orEmpty().map(::withStar))
    }

    override suspend fun artists(): List<Artist> { ensureScanned(); return artists }

    override suspend fun artist(id: String): ArtistDetail {
        ensureScanned()
        val a = artists.firstOrNull { it.id == id } ?: error("Artist not found")
        return ArtistDetail(a, albums.filter { it.artistId == id }.sortedByDescending { it.year })
    }

    override suspend fun song(id: String): Song { ensureScanned(); return songById[id]?.let(::withStar) ?: error("Song not found") }

    override suspend fun search(query: String, songCount: Int, albumCount: Int, artistCount: Int): SearchResults {
        ensureScanned()
        val q = query.trim().lowercase()
        if (q.isEmpty()) return SearchResults()
        return SearchResults(
            songs = songs.filter { q in it.title.lowercase() || q in it.artist.lowercase() || q in it.album.lowercase() }.take(songCount).map(::withStar),
            albums = albums.filter { q in it.name.lowercase() || q in it.artist.lowercase() }.take(albumCount),
            artists = artists.filter { q in it.name.lowercase() }.take(artistCount),
        )
    }

    override suspend fun randomSongs(size: Int, genre: String?): List<Song> {
        ensureScanned()
        return songs.filter { genre == null || it.genre.equals(genre, true) }.shuffled().take(size).map(::withStar)
    }

    override suspend fun songsByGenre(genre: String, count: Int, offset: Int): List<Song> {
        ensureScanned()
        return songs.filter { it.genre.equals(genre, true) }.sortedBy { it.title.lowercase() }.drop(offset).take(count).map(::withStar)
    }

    override suspend fun genres(): List<Genre> {
        ensureScanned()
        return songs.filter { !it.genre.isNullOrBlank() }.groupBy { it.genre!! }.map { (g, l) ->
            Genre(g, l.size, l.mapNotNull { it.albumId }.distinct().size)
        }.sortedBy { it.name.lowercase() }
    }

    override suspend fun topSongs(artistName: String, count: Int): List<Song> {
        ensureScanned()
        return songs.filter { it.artist.equals(artistName, true) }
            .sortedByDescending { stats[it.id]?.count ?: 0 }.take(count).map(::withStar)
    }

    // ---- stars / stats ----------------------------------------------------------------------------------------------

    private fun withStar(s: Song) = s.copy(starred = s.id in starredIds)

    override suspend fun starred(): StarredItems {
        ensureScanned()
        return StarredItems(
            songs = songs.filter { it.id in starredIds }.map(::withStar),
            albums = albums.filter { it.id in starredIds }.map { it.copy(starred = true) },
            artists = artists.filter { it.id in starredIds }.map { it.copy(starred = true) },
        )
    }

    override suspend fun setStarred(kind: StarKind, id: String, starred: Boolean) {
        if (starred) starredIds += id else starredIds -= id
        store.putString("local_starred", Json.encodeToString(starredIds.toList()))
    }

    override suspend fun scrobble(songId: String, timeMs: Long, submission: Boolean) {
        if (!submission) return
        val old = stats[songId] ?: PlayStat()
        stats[songId] = PlayStat(old.count + 1, nowMs())
        store.putString("local_stats", Json.encodeToString<Map<String, PlayStat>>(stats))
        scanned.let { if (it) buildIndexStatsOnly() }
    }

    /** Refresh derived play counts on albums after a stat change (cheap: just rebuilds Album copies). */
    private fun buildIndexStatsOnly() {
        albums = albums.map { a -> a.copy(playCount = albumSongs[a.id].orEmpty().sumOf { (stats[it.id]?.count ?: 0).toLong() }) }
    }

    // ---- playlists (app-local) ----------------------------------------------------------------------------------------------

    private fun savePlaylists() = store.putString("local_playlists", Json.encodeToString<List<LocalPlaylist>>(playlistStore))

    private fun LocalPlaylist.toModel(withSongs: Boolean): Playlist {
        val resolved = songIds.mapNotNull { songById[it] }.map(::withStar)
        return Playlist(
            id = id, name = name, songCount = resolved.size, durationSec = resolved.sumOf { it.durationSec },
            coverArt = resolved.firstOrNull()?.coverArt, songs = if (withSongs) resolved else emptyList(),
        )
    }

    override suspend fun playlists(): List<Playlist> { ensureScanned(); return playlistStore.map { it.toModel(false) } }

    override suspend fun playlist(id: String): Playlist {
        ensureScanned()
        return playlistStore.firstOrNull { it.id == id }?.toModel(true) ?: error("Playlist not found")
    }

    override suspend fun createPlaylist(name: String, songIds: List<String>): Playlist {
        ensureScanned()
        val p = LocalPlaylist("${LOCAL_PREFIX}pl:${nowMs()}", name, songIds)
        playlistStore += p; savePlaylists()
        return p.toModel(true)
    }

    private fun mutate(id: String, f: (LocalPlaylist) -> LocalPlaylist) {
        val i = playlistStore.indexOfFirst { it.id == id }
        if (i < 0) error("Playlist not found")
        playlistStore[i] = f(playlistStore[i]); savePlaylists()
    }

    override suspend fun addToPlaylist(playlistId: String, songIds: List<String>) = mutate(playlistId) { it.copy(songIds = it.songIds + songIds) }
    override suspend fun removeFromPlaylist(playlistId: String, indexes: List<Int>) =
        mutate(playlistId) { p -> p.copy(songIds = p.songIds.filterIndexed { i, _ -> i !in indexes.toSet() }) }
    override suspend fun renamePlaylist(id: String, name: String) = mutate(id) { it.copy(name = name) }
    override suspend fun deletePlaylist(id: String) { playlistStore.removeAll { it.id == id }; savePlaylists() }

    // ---- media ----------------------------------------------------------------------------------------------

    override suspend fun lyrics(song: Song): Lyrics? = null

    /** "local:art:<audioId>" → "devicecover://<audioId>" handled by the platform image fetcher. */
    override fun coverArtUrl(coverArtId: String, size: Int): String? =
        if (coverArtId.startsWith("${LOCAL_PREFIX}art:")) "devicecover://${coverArtId.removePrefix("${LOCAL_PREFIX}art:")}" else null

    override fun streamUrl(song: Song, maxBitRate: Int): String? = null
}
