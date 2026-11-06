package com.drift.app.player

import android.app.Application
import android.content.ComponentName
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.drift.app.model.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * Talks to [DriftPlaybackService] through a MediaController. The service's ExoPlayer owns the queue,
 * gapless transitions, audio focus and the notification — this class only mirrors state for the UI.
 * (No reconciliation, cooldown flags or watchdogs: ExoPlayer already knows what it is playing.)
 */
class AndroidPlaybackEngine(private val app: Application, private val scope: CoroutineScope) : PlaybackEngine {
    private val _state = MutableStateFlow(PlaybackState())
    override val state: StateFlow<PlaybackState> = _state.asStateFlow()
    private val _position = MutableStateFlow(Position())
    override val position: StateFlow<Position> = _position.asStateFlow()
    private val _ready = MutableStateFlow(false)
    override val isReady: StateFlow<Boolean> = _ready.asStateFlow()

    private var controller: MediaController? = null
    private val pending = ArrayList<(MediaController) -> Unit>()
    private var queue: List<Song> = emptyList()

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            if (events.contains(Player.EVENT_TIMELINE_CHANGED)) syncQueue(player)
            syncState(player, clearError = events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION) || events.contains(Player.EVENT_IS_PLAYING_CHANGED))
            updatePosition(player)
        }

        override fun onPlayerError(error: PlaybackException) {
            val c = controller ?: return
            _state.update { it.copy(error = "Can't play this song (${error.errorCodeName.removePrefix("ERROR_CODE_").lowercase().replace('_', ' ')})") }
            // ExoPlayer stops on a failed item: move on instead of leaving the user on a dead track.
            if (c.hasNextMediaItem()) { c.seekToNextMediaItem(); c.prepare(); c.play() }
        }
    }

    init {
        val token = SessionToken(app, ComponentName(app, DriftPlaybackService::class.java))
        val future = MediaController.Builder(app, token).setApplicationLooper(Looper.getMainLooper()).buildAsync()
        future.addListener({
            try {
                val c = future.get()
                controller = c
                c.addListener(listener)
                syncQueue(c); syncState(c, clearError = false); updatePosition(c)
                _ready.value = true
                pending.forEach { it(c) }; pending.clear()
            } catch (e: Exception) {
                _state.update { it.copy(error = "Playback service unavailable") }
                _ready.value = true
            }
        }, ContextCompat.getMainExecutor(app))

        scope.launch {
            while (true) {
                delay(500)
                controller?.let { if (it.mediaItemCount > 0) updatePosition(it) }
            }
        }
    }

    private fun withController(block: (MediaController) -> Unit) {
        val c = controller
        if (c != null) block(c) else pending += block
    }

    private fun syncQueue(p: Player) {
        queue = (0 until p.mediaItemCount).map { p.getMediaItemAt(it).toSong() }
    }

    private fun syncState(p: Player, clearError: Boolean) {
        val active = p.playWhenReady && (p.playbackState == Player.STATE_READY || p.playbackState == Player.STATE_BUFFERING)
        _state.update {
            it.copy(
                queue = queue,
                index = if (p.mediaItemCount == 0) -1 else p.currentMediaItemIndex,
                isPlaying = active,
                isBuffering = p.playWhenReady && p.playbackState == Player.STATE_BUFFERING,
                repeat = when (p.repeatMode) { Player.REPEAT_MODE_ALL -> RepeatMode.All; Player.REPEAT_MODE_ONE -> RepeatMode.One; else -> RepeatMode.Off },
                error = if (clearError && p.isPlaying) null else it.error,
            )
        }
    }

    private fun updatePosition(p: Player) {
        val song = queue.getOrNull(p.currentMediaItemIndex)
        val dur = p.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: ((song?.durationSec ?: 0) * 1000L)
        _position.value = Position(p.currentPosition.coerceAtLeast(0), dur, p.bufferedPosition.coerceAtLeast(0))
    }

    override fun setQueue(items: List<QueueItem>, startIndex: Int, playWhenReady: Boolean, startPositionMs: Long) = withController { c ->
        _state.update { it.copy(error = null) }
        c.setMediaItems(items.map { it.toMediaItem() }, startIndex.coerceIn(0, (items.size - 1).coerceAtLeast(0)), if (startPositionMs > 0) startPositionMs else C.TIME_UNSET)
        c.prepare()
        c.playWhenReady = playWhenReady
    }

    override fun play() = withController { c -> if (c.playbackState == Player.STATE_ENDED) c.seekTo(0, 0); c.prepare(); c.play() }
    override fun pause() = withController { it.pause() }
    override fun next() = withController { it.seekToNext() }
    override fun previous() = withController { it.seekToPrevious() }
    override fun seekTo(positionMs: Long) = withController { it.seekTo(positionMs); updatePosition(it) }
    override fun skipTo(index: Int) = withController { c -> c.seekTo(index, 0); c.play() }
    override fun addToQueue(items: List<QueueItem>) = withController { c ->
        val wasEmpty = c.mediaItemCount == 0
        c.addMediaItems(items.map { it.toMediaItem() })
        if (wasEmpty) { c.prepare(); c.play() }
    }
    override fun playNext(items: List<QueueItem>) = withController { c ->
        c.addMediaItems((c.currentMediaItemIndex + 1).coerceAtMost(c.mediaItemCount), items.map { it.toMediaItem() })
    }
    override fun removeAt(index: Int) = withController { it.removeMediaItem(index) }
    override fun replaceUpcoming(items: List<QueueItem>) = withController { c ->
        val from = c.currentMediaItemIndex + 1
        if (from < c.mediaItemCount) c.removeMediaItems(from, c.mediaItemCount)
        c.addMediaItems(items.map { it.toMediaItem() })
    }
    override fun setRepeat(mode: RepeatMode) = withController {
        it.repeatMode = when (mode) { RepeatMode.Off -> Player.REPEAT_MODE_OFF; RepeatMode.All -> Player.REPEAT_MODE_ALL; RepeatMode.One -> Player.REPEAT_MODE_ONE }
    }
    override fun stop() = withController { it.stop(); it.clearMediaItems() }
}
