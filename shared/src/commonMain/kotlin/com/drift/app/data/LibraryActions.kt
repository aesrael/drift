package com.drift.app.data

import com.drift.app.model.*
import com.drift.app.source.SourceRouter
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/** User-initiated mutations (stars, playlists) with optimistic UI + one place that reports errors. */
class LibraryActions(
    private val router: SourceRouter,
    private val downloads: DownloadManager,
    private val prefs: AppPrefs,
    private val cache: QueryCache,
    private val scope: CoroutineScope,
) {
    private val _starred = MutableStateFlow<Set<String>>(emptySet())
    val starredIds: StateFlow<Set<String>> = _starred.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    fun message(m: String) { _messages.tryEmit(m) }

    suspend fun refreshStarred() {
        try {
            val s = router.starred()
            _starred.value = (s.songs.map { it.id } + s.albums.map { it.id } + s.artists.map { it.id }).toSet()
            if (prefs.downloadStarred.value) downloads.enqueueAll(s.songs.filter { !it.isLocal }, auto = true)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) { /* offline: keep what we have */ }
    }

    fun isStarred(song: Song) = song.id in _starred.value

    fun toggleStar(kind: StarKind, id: String, song: Song? = null) {
        val now = id !in _starred.value
        _starred.update { if (now) it + id else it - id }
        scope.launch {
            try {
                router.setStarred(kind, id, now)
                if (song != null && !song.isLocal && prefs.downloadStarred.value) {
                    if (now) downloads.enqueue(song, auto = true) else downloads.remove(song.id, onlyAuto = true)
                }
                cache.invalidate("starred")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _starred.update { if (now) it - id else it + id } // roll back
                message("Couldn't update favourite: ${e.message}")
            }
        }
    }

    fun toggleStar(song: Song) = toggleStar(StarKind.Song, song.id, song)

    fun addToPlaylist(playlistId: String, songs: List<Song>) = launchReporting("Added to playlist") {
        router.addToPlaylist(playlistId, songs.map { it.id }); cache.invalidate("playlist")
    }

    fun createPlaylist(name: String, songs: List<Song> = emptyList()) = launchReporting("Playlist created") {
        router.createPlaylist(name, songs.map { it.id }); cache.invalidate("playlist")
    }

    fun deletePlaylist(id: String, then: () -> Unit = {}) = launchReporting("Playlist deleted") {
        router.deletePlaylist(id); cache.invalidate("playlist"); then()
    }

    fun renamePlaylist(id: String, name: String) = launchReporting(null) { router.renamePlaylist(id, name); cache.invalidate("playlist") }

    fun removeFromPlaylist(id: String, index: Int) = launchReporting("Removed") { router.removeFromPlaylist(id, listOf(index)); cache.invalidate("playlist") }

    private fun launchReporting(success: String?, block: suspend () -> Unit) {
        scope.launch {
            try {
                block(); success?.let(::message)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                message(e.message ?: "Something went wrong")
            }
        }
    }
}
