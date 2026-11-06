package com.drift.app.player

import com.drift.app.data.AppPrefs
import com.drift.app.model.Song
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
private data class PersistedSession(
    val queue: List<Song>,
    val index: Int,
    val positionMs: Long,
    val shuffle: Boolean,
    val label: String?,
    val source: QueueSource? = null,
)

/** Where the queue came from, so Now Playing can link back to it (album, playlist, genre, artist, downloads…). */
@Serializable
data class QueueSource(val kind: String, val id: String? = null, val label: String)

/**
 * App-level playback API. Owns only what the native player can't express:
 * the un-shuffled order (so shuffle can be toggled off again), the "playing from" label,
 * and session persistence. Everything else is delegated to [PlaybackEngine].
 */
@OptIn(FlowPreview::class)
class PlayerController(
    private val engine: PlaybackEngine,
    private val resolver: PlaybackResolver,
    private val prefs: AppPrefs,
    private val scope: CoroutineScope,
) {
    val state: StateFlow<PlaybackState> get() = engine.state
    val position: StateFlow<Position> get() = engine.position

    private val _shuffle = MutableStateFlow(false)
    val shuffle: StateFlow<Boolean> = _shuffle.asStateFlow()
    private val _label = MutableStateFlow<String?>(null)
    val sourceLabel: StateFlow<String?> = _label.asStateFlow()
    private val _source = MutableStateFlow<QueueSource?>(null)
    val source: StateFlow<QueueSource?> = _source.asStateFlow()

    private var original: List<Song> = emptyList()
    private var expectedIds: List<String> = emptyList()

    init {
        // Queue changed by someone else (Android Auto, Bluetooth, notification): adopt it as the new "original".
        scope.launch {
            engine.state.map { st -> st.queue.map { it.id } }.distinctUntilChanged().debounce(400).collect { ids ->
                if (ids.isNotEmpty() && ids != expectedIds) {
                    original = engine.state.value.queue
                    expectedIds = ids
                    _shuffle.value = false
                }
            }
        }
        // Persist queue + position.
        scope.launch {
            engine.state.map { Triple(it.queue.map { s -> s.id }, it.index, it.isPlaying) }
                .distinctUntilChanged().debounce(1000).collect { persist() }
        }
        scope.launch {
            while (true) { delay(15_000); if (engine.state.value.isPlaying) persist() }
        }
        scope.launch { restore() }
    }

    // ---- starting playback ---------------------------------------------------------------------------------------

    /** Play [songs] starting at [startIndex]. [shuffle] = null keeps the current shuffle setting. */
    fun play(songs: List<Song>, startIndex: Int = 0, label: String? = null, shuffle: Boolean? = null, source: QueueSource? = null) {
        val playable = songs.filter { resolver.uriFor(it) != null }
        if (playable.isEmpty()) return
        val start = songs.getOrNull(startIndex)?.let { s -> playable.indexOfFirst { it.id == s.id } }?.takeIf { it >= 0 } ?: 0
        val sh = shuffle ?: _shuffle.value
        val ordered = if (sh) listOf(playable[start]) + playable.filterIndexed { i, _ -> i != start }.shuffled() else playable
        original = playable
        _shuffle.value = sh
        _label.value = source?.label ?: label
        _source.value = source
        expectedIds = ordered.map { it.id }
        engine.setQueue(resolver.items(ordered), if (sh) 0 else start, playWhenReady = true)
    }

    fun playShuffled(songs: List<Song>, label: String? = null, source: QueueSource? = null) {
        if (songs.isEmpty()) return
        play(songs, startIndex = songs.indices.random(), label = label, shuffle = true, source = source)
    }

    // ---- transport -------------------------------------------------------------------------------------------------

    fun toggle() { if (state.value.isPlaying) engine.pause() else engine.play() }
    fun play() = engine.play()
    fun pause() = engine.pause()
    fun next() = engine.next()
    fun previous() = engine.previous()
    fun seekTo(ms: Long) = engine.seekTo(ms)
    fun skipTo(index: Int) = engine.skipTo(index)
    fun stop() { engine.stop(); original = emptyList(); expectedIds = emptyList(); _label.value = null; _source.value = null; prefs.sessionJson = null }

    fun cycleRepeat() = engine.setRepeat(
        when (state.value.repeat) { RepeatMode.Off -> RepeatMode.All; RepeatMode.All -> RepeatMode.One; RepeatMode.One -> RepeatMode.Off },
    )

    // ---- queue editing -------------------------------------------------------------------------------------------------

    fun addToQueue(songs: List<Song>) {
        val items = resolver.items(songs); if (items.isEmpty()) return
        original = original + items.map { it.song }
        expectedIds = expectedIds + items.map { it.song.id }
        engine.addToQueue(items)
    }

    fun playNext(songs: List<Song>) {
        val items = resolver.items(songs); if (items.isEmpty()) return
        val st = state.value
        val at = (st.index + 1).coerceIn(0, st.queue.size)
        expectedIds = expectedIds.toMutableList().apply { addAll(at.coerceAtMost(size), items.map { it.song.id }) }
        val curId = st.current?.id
        val origAt = original.indexOfFirst { it.id == curId }.let { if (it < 0) original.size else it + 1 }
        original = original.toMutableList().apply { addAll(origAt, items.map { it.song }) }
        engine.playNext(items)
    }

    fun removeAt(index: Int) {
        val st = state.value
        val removed = st.queue.getOrNull(index) ?: return
        expectedIds = expectedIds.toMutableList().apply { if (index in indices) removeAt(index) }
        original = original.toMutableList().apply { indexOfFirst { it.id == removed.id }.takeIf { it >= 0 }?.let { removeAt(it) } }
        engine.removeAt(index)
    }

    fun toggleShuffle() {
        val st = state.value
        val cur = st.current
        val on = !_shuffle.value
        _shuffle.value = on
        if (cur == null) return
        val upcoming: List<Song> = if (on) {
            st.queue.drop(st.index + 1).shuffled()
        } else {
            val at = original.indexOfFirst { it.id == cur.id }
            if (at >= 0) original.drop(at + 1) else st.queue.drop(st.index + 1)
        }
        expectedIds = st.queue.take(st.index + 1).map { it.id } + upcoming.map { it.id }
        engine.replaceUpcoming(resolver.items(upcoming))
    }

    // ---- persistence -------------------------------------------------------------------------------------------------

    private fun persist() {
        val st = state.value
        if (st.queue.isEmpty() || st.index < 0) return
        // Keep at most 200 songs around the current one so the blob stays small.
        val from = (st.index - 20).coerceAtLeast(0)
        val to = (from + 200).coerceAtMost(st.queue.size)
        val s = PersistedSession(st.queue.subList(from, to), st.index - from, position.value.positionMs, _shuffle.value, _label.value, _source.value)
        prefs.sessionJson = runCatching { Json.encodeToString(s) }.getOrNull()
    }

    private suspend fun restore() {
        engine.isReady.first { it }
        if (engine.state.value.queue.isNotEmpty()) return // background service survived: don't touch it
        val s = prefs.sessionJson?.let { runCatching { Json.decodeFromString<PersistedSession>(it) }.getOrNull() } ?: return
        val items = s.queue.map { resolver.item(it) }
        if (items.any { it == null }) { // some songs not playable right now (signed out / permission): skip restore
            val ok = items.filterNotNull(); if (ok.isEmpty()) return
            expectedIds = ok.map { it.song.id }; original = ok.map { it.song }
            engine.setQueue(ok, s.index.coerceIn(0, ok.lastIndex), false, s.positionMs)
        } else {
            val list = items.filterNotNull()
            expectedIds = list.map { it.song.id }; original = list.map { it.song }
            engine.setQueue(list, s.index.coerceIn(0, list.lastIndex), false, s.positionMs)
        }
        _shuffle.value = s.shuffle
        _label.value = s.label
        _source.value = s.source
    }
}
