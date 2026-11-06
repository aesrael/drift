package com.drift.app.player

import com.drift.app.model.Song
import kotlinx.coroutines.flow.StateFlow

enum class RepeatMode { Off, All, One }

/** A song plus everything the native player needs to open it. */
data class QueueItem(val song: Song, val uri: String, val artworkUrl: String?)

data class PlaybackState(
    /** The native queue, in play order. The platform player is the single source of truth. */
    val queue: List<Song> = emptyList(),
    val index: Int = -1,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val repeat: RepeatMode = RepeatMode.Off,
    val error: String? = null,
) {
    val current: Song? get() = queue.getOrNull(index)
    val hasNext: Boolean get() = index in 0 until queue.lastIndex || (repeat != RepeatMode.Off && queue.isNotEmpty())
}

data class Position(val positionMs: Long = 0, val durationMs: Long = 0, val bufferedMs: Long = 0)

/**
 * Thin wrapper over the platform audio stack. No JS-style "logical queue" on the side:
 * Android = Media3 MediaLibraryService (also serves Android Auto / Bluetooth / notification),
 * iOS = AVQueuePlayer + MPRemoteCommandCenter.
 */
interface PlaybackEngine {
    val state: StateFlow<PlaybackState>
    val position: StateFlow<Position>
    /** false until the engine has synchronised with any queue that survived in the background service. */
    val isReady: StateFlow<Boolean>

    fun setQueue(items: List<QueueItem>, startIndex: Int, playWhenReady: Boolean, startPositionMs: Long = 0)
    fun play()
    fun pause()
    fun next()
    fun previous()
    fun seekTo(positionMs: Long)
    fun skipTo(index: Int)
    fun addToQueue(items: List<QueueItem>)
    fun playNext(items: List<QueueItem>)
    fun removeAt(index: Int)
    /** Replace everything after the current item (used by shuffle on/off). */
    fun replaceUpcoming(items: List<QueueItem>)
    fun setRepeat(mode: RepeatMode)
    fun stop()
}
