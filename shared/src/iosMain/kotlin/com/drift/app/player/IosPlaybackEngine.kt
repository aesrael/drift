@file:OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)

package com.drift.app.player

import com.drift.app.platform.deviceArtJpeg
import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import platform.AVFAudio.*
import platform.AVFoundation.*
import platform.CoreMedia.CMTimeGetSeconds
import platform.CoreMedia.CMTimeMakeWithSeconds
import platform.Foundation.*
import platform.MediaPlayer.*
import platform.UIKit.UIImage

/**
 * AVQueuePlayer holding at most [current, next]. The Kotlin side owns the full queue; the native queue is
 * only a two-item window, which gives gapless playback without ever having two sources of truth.
 */
class IosPlaybackEngine(private val scope: CoroutineScope) : PlaybackEngine {
    private val _state = MutableStateFlow(PlaybackState())
    override val state: StateFlow<PlaybackState> = _state.asStateFlow()
    private val _position = MutableStateFlow(Position())
    override val position: StateFlow<Position> = _position.asStateFlow()
    override val isReady: StateFlow<Boolean> = MutableStateFlow(true)

    private val player = AVQueuePlayer()
    private var items: List<QueueItem> = emptyList()
    private var index = -1
    private var repeat = RepeatMode.Off
    private var wantPlay = false
    private var curItem: AVPlayerItem? = null
    private var nextItem: AVPlayerItem? = null
    private var nextIndex: Int? = null
    private var failedItem: AVPlayerItem? = null
    private var lastError: String? = null
    private var artworkFor: String? = null
    private var artwork: MPMediaItemArtwork? = null

    init {
        val session = AVAudioSession.sharedInstance()
        session.setCategory(AVAudioSessionCategoryPlayback, null)
        session.setActive(true, null)
        observe()
        registerRemoteCommands()
        scope.launch { while (true) { delay(400); tick() } }
    }

    // ---- queue window -----------------------------------------------------------------------------------------------

    private fun makeItem(q: QueueItem): AVPlayerItem? {
        val url = if (q.uri.startsWith("file://")) NSURL.fileURLWithPath(q.uri.removePrefix("file://")) else NSURL.URLWithString(q.uri)
        return url?.let { AVPlayerItem.playerItemWithURL(it) }
    }

    private fun computeNext(): Int? = when {
        items.isEmpty() || index < 0 -> null
        repeat == RepeatMode.One -> index
        repeat == RepeatMode.All -> (index + 1) % items.size
        index + 1 < items.size -> index + 1
        else -> null
    }

    private fun prepareNext() {
        val cur = player.currentItem
        player.items().drop(1).forEach { (it as? AVPlayerItem)?.let { i -> player.removeItem(i) } }
        nextItem = null
        nextIndex = computeNext()
        val ni = nextIndex ?: return
        val item = makeItem(items[ni]) ?: return
        player.insertItem(item, cur)
        nextItem = item
    }

    private fun rebuild(play: Boolean, startMs: Long) {
        player.removeAllItems()
        lastError = null
        val q = items.getOrNull(index)
        val item = q?.let { makeItem(it) }
        if (item == null) {
            curItem = null; nextItem = null; nextIndex = null
            wantPlay = false
            lastError = if (q != null) "Can't open this song" else null
            publish(); return
        }
        curItem = item
        player.insertItem(item, null)
        if (startMs > 0) player.seekToTime(CMTimeMakeWithSeconds(startMs / 1000.0, 1000))
        prepareNext()
        wantPlay = play
        if (play) player.play() else player.pause()
        _position.value = Position(startMs, items[index].song.durationSec * 1000L, 0)
        publish(); updateNowPlaying(reloadArtwork = true)
    }

    private fun publish() {
        val buffering = wantPlay && player.timeControlStatus == AVPlayerTimeControlStatusWaitingToPlayAtSpecifiedRate
        _state.value = PlaybackState(
            queue = items.map { it.song }, index = index,
            isPlaying = wantPlay && curItem != null, isBuffering = buffering && curItem != null,
            repeat = repeat, error = lastError,
        )
    }

    // ---- periodic poll (position, errors, buffering) --------------------------------------------------------------------

    private fun tick() {
        val cur = player.currentItem ?: return
        val pos = CMTimeGetSeconds(player.currentTime())
        val dur = CMTimeGetSeconds(cur.duration).let { if (it.isNaN() || it.isInfinite() || it <= 0) items.getOrNull(index)?.song?.durationSec?.toDouble() ?: 0.0 else it }
        _position.value = Position((pos * 1000).toLong().coerceAtLeast(0), (dur * 1000).toLong(), 0)
        if (cur.status == AVPlayerItemStatusFailed && failedItem !== cur) {
            failedItem = cur
            lastError = "Can't play this song: ${cur.error?.localizedDescription ?: "unknown error"}"
            val hasNext = index + 1 < items.size || repeat == RepeatMode.All
            if (hasNext) next() else { wantPlay = false; publish() }
            return
        }
        val buffering = wantPlay && player.timeControlStatus == AVPlayerTimeControlStatusWaitingToPlayAtSpecifiedRate
        if (buffering != _state.value.isBuffering) publish()
    }

    // ---- notifications ---------------------------------------------------------------------------------------------------

    private fun observe() {
        val nc = NSNotificationCenter.defaultCenter
        val main = NSOperationQueue.mainQueue

        nc.addObserverForName(AVPlayerItemDidPlayToEndTimeNotification, null, main) { n ->
            val ended = n?.`object` as? AVPlayerItem ?: return@addObserverForName
            if (ended !== curItem) return@addObserverForName
            val ni = nextIndex
            if (ni == null) { // end of queue
                wantPlay = false; player.pause(); publish(); updateNowPlaying(false); return@addObserverForName
            }
            index = ni
            curItem = nextItem
            if (curItem == null || player.currentItem !== curItem) rebuild(true, 0) else { prepareNext(); publish(); updateNowPlaying(true) }
        }

        nc.addObserverForName(AVAudioSessionInterruptionNotification, null, main) { n ->
            val type = (n?.userInfo?.get(AVAudioSessionInterruptionTypeKey) as? NSNumber)?.unsignedLongValue
            if (type == AVAudioSessionInterruptionTypeBegan) { // phone call, Siri, other app took audio
                player.pause(); publish()
            } else if (type == AVAudioSessionInterruptionTypeEnded) {
                val opts = (n?.userInfo?.get(AVAudioSessionInterruptionOptionKey) as? NSNumber)?.unsignedLongValue ?: 0UL
                if (wantPlay && (opts and AVAudioSessionInterruptionOptionShouldResume) != 0UL) {
                    AVAudioSession.sharedInstance().setActive(true, null); player.play(); publish()
                }
            }
        }

        nc.addObserverForName(AVAudioSessionRouteChangeNotification, null, main) { n ->
            val reason = (n?.userInfo?.get(AVAudioSessionRouteChangeReasonKey) as? NSNumber)?.unsignedLongValue
            if (reason == AVAudioSessionRouteChangeReasonOldDeviceUnavailable) { // headphones unplugged
                wantPlay = false; player.pause(); publish(); updateNowPlaying(false)
            }
        }
    }

    private fun registerRemoteCommands() {
        val cc = MPRemoteCommandCenter.sharedCommandCenter()
        cc.playCommand.addTargetWithHandler { play(); MPRemoteCommandHandlerStatusSuccess }
        cc.pauseCommand.addTargetWithHandler { pause(); MPRemoteCommandHandlerStatusSuccess }
        cc.togglePlayPauseCommand.addTargetWithHandler { if (wantPlay) pause() else play(); MPRemoteCommandHandlerStatusSuccess }
        cc.nextTrackCommand.addTargetWithHandler { next(); MPRemoteCommandHandlerStatusSuccess }
        cc.previousTrackCommand.addTargetWithHandler { previous(); MPRemoteCommandHandlerStatusSuccess }
        cc.changePlaybackPositionCommand.addTargetWithHandler { e ->
            (e as? MPChangePlaybackPositionCommandEvent)?.let { seekTo((it.positionTime * 1000).toLong()) }
            MPRemoteCommandHandlerStatusSuccess
        }
    }

    private fun updateNowPlaying(reloadArtwork: Boolean) {
        val q = items.getOrNull(index)
        val center = MPNowPlayingInfoCenter.defaultCenter()
        if (q == null) { center.nowPlayingInfo = null; return }
        val s = q.song
        val info = mutableMapOf<Any?, Any?>(
            MPMediaItemPropertyTitle to s.title,
            MPMediaItemPropertyArtist to s.artist,
            MPMediaItemPropertyAlbumTitle to s.album,
            MPMediaItemPropertyPlaybackDuration to s.durationSec.toDouble(),
            MPNowPlayingInfoPropertyElapsedPlaybackTime to (_position.value.positionMs / 1000.0),
            MPNowPlayingInfoPropertyPlaybackRate to (if (wantPlay) 1.0 else 0.0),
        )
        if (artworkFor == s.id) artwork?.let { info[MPMediaItemPropertyArtwork] = it }
        center.nowPlayingInfo = info
        if (reloadArtwork && artworkFor != s.id) {
            artworkFor = s.id; artwork = null
            val url = q.artworkUrl
            scope.launch {
                val data = withContext(Dispatchers.Default) {
                    when {
                        url == null -> null
                        url.startsWith("devicecover://") -> deviceArtJpeg(url.removePrefix("devicecover://"))
                        else -> NSURL.URLWithString(url)?.let { NSData.dataWithContentsOfURL(it) }
                    }
                }
                val img = data?.let { UIImage.imageWithData(it) } ?: return@launch
                if (artworkFor != s.id) return@launch
                artwork = MPMediaItemArtwork(boundsSize = img.size, requestHandler = { _ -> img })
                updateNowPlaying(false)
            }
        }
    }

    // ---- PlaybackEngine -----------------------------------------------------------------------------------------------

    override fun setQueue(items: List<QueueItem>, startIndex: Int, playWhenReady: Boolean, startPositionMs: Long) {
        this.items = items
        index = if (items.isEmpty()) -1 else startIndex.coerceIn(0, items.lastIndex)
        artworkFor = null
        rebuild(playWhenReady, startPositionMs)
    }

    override fun play() {
        if (items.isEmpty()) return
        AVAudioSession.sharedInstance().setActive(true, null)
        if (player.currentItem == null) { rebuild(true, 0); return }
        wantPlay = true; player.play(); publish(); updateNowPlaying(false)
    }

    override fun pause() { wantPlay = false; player.pause(); publish(); updateNowPlaying(false) }

    override fun next() {
        val ni = when { index + 1 < items.size -> index + 1; repeat != RepeatMode.Off && items.isNotEmpty() -> 0; else -> return }
        index = ni; rebuild(true, 0)
    }

    override fun previous() {
        if (items.isEmpty()) return
        if (_position.value.positionMs > 3000) { seekTo(0); return }
        index = when { index > 0 -> index - 1; repeat != RepeatMode.Off -> items.lastIndex; else -> { seekTo(0); return } }
        rebuild(true, 0)
    }

    override fun seekTo(positionMs: Long) {
        player.seekToTime(CMTimeMakeWithSeconds(positionMs / 1000.0, 1000))
        _position.value = _position.value.copy(positionMs = positionMs)
        updateNowPlaying(false)
    }

    override fun skipTo(index: Int) { if (index in items.indices) { this.index = index; rebuild(true, 0) } }

    override fun addToQueue(items: List<QueueItem>) {
        val wasEmpty = this.items.isEmpty()
        this.items = this.items + items
        if (wasEmpty) { index = 0; rebuild(true, 0) } else { prepareNext(); publish() }
    }

    override fun playNext(items: List<QueueItem>) {
        val at = (index + 1).coerceIn(0, this.items.size)
        this.items = this.items.take(at) + items + this.items.drop(at)
        prepareNext(); publish()
    }

    override fun removeAt(index: Int) {
        if (index !in items.indices) return
        val removingCurrent = index == this.index
        items = items.filterIndexed { i, _ -> i != index }
        if (index < this.index) this.index--
        if (removingCurrent) {
            if (items.isEmpty()) { stop(); return }
            this.index = this.index.coerceAtMost(items.lastIndex)
            rebuild(wantPlay, 0)
        } else { prepareNext(); publish() }
    }

    override fun replaceUpcoming(items: List<QueueItem>) {
        if (index < 0) return
        this.items = this.items.take(index + 1) + items
        prepareNext(); publish()
    }

    override fun setRepeat(mode: RepeatMode) { repeat = mode; prepareNext(); publish() }

    override fun stop() {
        player.removeAllItems(); items = emptyList(); index = -1
        curItem = null; nextItem = null; nextIndex = null; wantPlay = false; lastError = null
        _position.value = Position()
        MPNowPlayingInfoCenter.defaultCenter().nowPlayingInfo = null
        publish()
    }
}
