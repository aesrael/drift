package com.drift.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.MediaBrowserServiceCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem as Media3Item
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.net.HttpURLConnection
import java.security.MessageDigest

/**
 * DriftMediaService — self-contained Android Auto player.
 *
 * Responsibilities:
 *  1. Serve a browse tree to Android Auto (onGetRoot / onLoadChildren)
 *  2. Play audio directly via ExoPlayer when a track is selected
 *  3. Keep MediaSession state in sync so AA shows correct playback UI
 *
 * Completely independent of react-native-track-player / JS bridge.
 * MusicService (RNTP) continues to handle phone-screen playback separately.
 *
 * Thread model:
 *  - ExoPlayer, MediaSession: main thread only
 *  - Network (loadChildren): IO thread via serviceScope
 *  - browsedQueue + playbackQueue indices: written on IO thread, read on main thread
 *    Both are @Volatile — write is immediately visible to main thread,
 *    so onPlayFromMediaId never sees stale browse/playback state
 *
 * Browse tree:
 *   ROOT
 *   ├── top_songs      Top 50 most-played
 *   ├── playlists      User playlists (browsable)
 *   │   └── playlist/<id>  Tracks in that playlist
 *   └── random         30 random tracks
 */
class DriftMediaService : MediaBrowserServiceCompat() {

    // ── Constants ────────────────────────────────────────────────────────────

    private val CHANNEL_ID = "drift_aa_playback"
    private val NOTIFICATION_ID = 1001
    private val CONFIG_KEY = "serverConfig"
    private val TAG = "DriftMediaService"

    // ── State — main thread only ─────────────────────────────────────────────

    private lateinit var mediaSession: MediaSessionCompat
    private lateinit var player: ExoPlayer
    private val mainHandler = Handler(Looper.getMainLooper())
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var currentNowPlayingBitmap: Bitmap? = null
    private var progressTickerRunning = false
    @Volatile private var scrobbleSubmissionId: String? = null
    private val progressTicker = object : Runnable {
        override fun run() {
            if (!progressTickerRunning) return
            if (player.isPlaying) {
                mediaSession.setPlaybackState(
                    buildState(PlaybackStateCompat.STATE_PLAYING, player.currentPosition)
                )
                maybeScrobbleSubmission()
            }
            mainHandler.postDelayed(this, 1000)
        }
    }

    private data class QueueItem(
        val streamUrl: String,
        val trackId: String,
        val title: String,
        val artist: String,
        val coverArtUrl: String? = null,
    )

    // Written on IO thread (browse), read on main thread (playback).
    // @Volatile ensures main thread always sees the latest value written by IO thread.
    @Volatile private var browsedQueue: List<QueueItem> = emptyList()
    @Volatile private var browsedQueueSource: String? = null
    @Volatile private var playbackQueue: List<QueueItem> = emptyList()
    @Volatile private var playbackIndex: Int = 0
    @Volatile private var playbackIndexByTrackId: Map<String, Int> = emptyMap()
    @Volatile private var playbackQueueSource: String? = null
    @Volatile private var lastKnownMetaById: Map<String, Pair<String, String>> = emptyMap()

    private var stallWatchdog: Runnable? = null
    private var stallConfirm: Runnable? = null

    // ── Lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        // ExoPlayer must be created on the main thread.
        player = ExoPlayer.Builder(this).build().apply {
            // Request audio focus so other app/session playback is paused.
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true
            )
        }
        player.addListener(ExoPlayerListener())

        mediaSession = MediaSessionCompat(this, "DriftAASession").apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setPlaybackState(buildState(PlaybackStateCompat.STATE_NONE, 0L))
            setCallback(SessionCallback())
            isActive = true
        }
        sessionToken = mediaSession.sessionToken
    }

    override fun onDestroy() {
        super.onDestroy()
        progressTickerRunning = false
        mainHandler.removeCallbacks(progressTicker)
        serviceScope.cancel()
        player.release()
        mediaSession.release()
    }

    // ── MediaBrowserServiceCompat ────────────────────────────────────────────

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?,
    ): BrowserRoot = BrowserRoot("ROOT", null)

    override fun onLoadChildren(
        parentId: String,
        result: Result<List<MediaBrowserCompat.MediaItem>>,
    ) {
        android.util.Log.d(TAG, "onLoadChildren: parentId=$parentId")
        result.detach()
        serviceScope.launch {
            val items = loadChildren(parentId)
            android.util.Log.d(TAG, "onLoadChildren: parentId=$parentId returned ${items.size} items")
            result.sendResult(items)
        }
    }

    // Runs on IO thread. Returns browse items and refreshes browse queue context.
    private fun loadChildren(parentId: String): List<MediaBrowserCompat.MediaItem> {
        val config = getConfig()
        if (config == null) {
            android.util.Log.e(TAG, "loadChildren: getConfig() returned null — server config not found in RKStorage")
            return emptyList()
        }
        return when {
            parentId == "ROOT"               -> buildRoot()
            parentId == "top_songs"          -> buildTopSongs(config)
            parentId == "random"             -> buildRandom(config)
            parentId == "playlists"          -> buildPlaylists(config)
            parentId.startsWith("playlist/") ->
                buildPlaylistTracks(config, parentId.removePrefix("playlist/"))
            else -> emptyList()
        }
    }

    // ── Browse builders (IO thread) ──────────────────────────────────────────

    private fun buildRoot(): List<MediaBrowserCompat.MediaItem> = listOf(
        browseItem("top_songs", "Top Songs",  "Your most-played tracks"),
        browseItem("playlists", "Playlists",  "Your playlists"),
        browseItem("random",    "Random Mix", "30 random tracks"),
    )

    private fun buildTopSongs(config: ServerConfig): List<MediaBrowserCompat.MediaItem> {
        val queueItems = fetchTopSongsQueue(config)
        setBrowsedQueue(queueItems, "top_songs")
        return queueItems.map { playableItem(it) }
    }

    private fun buildRandom(config: ServerConfig): List<MediaBrowserCompat.MediaItem> {
        val queueItems = fetchRandomQueue(config)
        setBrowsedQueue(queueItems, "random")
        // Eagerly warm the first 2 items BEFORE the user even hits play, since Random Mix is highly likely to contain un-cached tracks.
        serviceScope.launch { warmTracks(queueItems, -1, 2) }
        return queueItems.map { playableItem(it) }
    }

    private fun fetchTopSongsQueue(config: ServerConfig): List<QueueItem> {
        val response = fetch(apiUrl(config, "getTopSongs", "count=50")) ?: return emptyList()
        val songs = jsonArrayOrSingle(response.optJSONObject("topSongs")?.opt("song")) ?: return emptyList()
        return buildItemsFromSongs(config, songs)
    }

    private fun fetchRandomQueue(config: ServerConfig): List<QueueItem> {
        val response = fetch(apiUrl(config, "getRandomSongs", "size=30")) ?: return emptyList()
        val songs = jsonArrayOrSingle(response.optJSONObject("randomSongs")?.opt("song")) ?: return emptyList()
        return buildItemsFromSongs(config, songs)
    }

    private fun buildPlaylists(config: ServerConfig): List<MediaBrowserCompat.MediaItem> {
        val response = fetch(apiUrl(config, "getPlaylists")) ?: return emptyList()
        val playlists = jsonArrayOrSingle(response.optJSONObject("playlists")?.opt("playlist")) ?: return emptyList()
        val items = mutableListOf<MediaBrowserCompat.MediaItem>()
        for (i in 0 until playlists.length()) {
            val p = playlists.optJSONObject(i) ?: continue
            val id = p.optString("id")
            if (id.isEmpty()) continue
            val name  = p.optString("name", "Playlist")
            val count = p.optInt("songCount", 0)
            val cover = resolvePlaylistCover(config, id, p.optString("coverArt").ifBlank { null })
            items.add(browseItem("playlist/$id", name, "$count songs", cover))
        }
        return items
    }

    private fun buildPlaylistTracks(config: ServerConfig, playlistId: String): List<MediaBrowserCompat.MediaItem> {
        val trackItems = fetchPlaylistQueue(config, playlistId)
        setBrowsedQueue(trackItems, "playlist/$playlistId")

        // Prepend a shuffle item — tapping it shuffles the queue and plays from index 0
        val shuffleDesc = MediaDescriptionCompat.Builder()
            .setMediaId("__shuffle__")
            .setTitle("Shuffle")
            .setSubtitle("Play ${trackItems.size} songs in random order")
            .build()
        val shuffleItem = MediaBrowserCompat.MediaItem(shuffleDesc, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)

        return listOf(shuffleItem) + trackItems.map { playableItem(it) }
    }

    private fun fetchPlaylistQueue(config: ServerConfig, playlistId: String): List<QueueItem> {
        val response = fetch(apiUrl(config, "getPlaylist", "id=$playlistId")) ?: return emptyList()
        val entries = jsonArrayOrSingle(response.optJSONObject("playlist")?.opt("entry")) ?: return emptyList()
        return buildItemsFromSongs(config, entries)
    }

    /**
     * Shared helper: converts a JSONArray of song objects into QueueItems.
     */
    private fun buildItemsFromSongs(
        config: ServerConfig,
        songs: JSONArray,
    ): List<QueueItem> {
        val builtQueue = mutableListOf<QueueItem>()
        for (i in 0 until songs.length()) {
            val s = songs.optJSONObject(i) ?: continue
            val qi = songToQueueItem(config, s)
            if (qi.streamUrl.isBlank()) continue
            builtQueue.add(qi)
        }
        return builtQueue
    }

    private fun setBrowsedQueue(items: List<QueueItem>, source: String) {
        browsedQueue = items
        browsedQueueSource = source
        mergeKnownMeta(items)
    }

    private fun setPlaybackQueue(items: List<QueueItem>, index: Int = 0, source: String? = null) {
        playbackQueue = items
        playbackIndex = index.coerceIn(0, (items.lastIndex).coerceAtLeast(0))
        playbackIndexByTrackId = items.mapIndexed { idx, item -> item.trackId to idx }.toMap()
        playbackQueueSource = source
        mergeKnownMeta(items)
        publishPlaybackQueue()
    }

    private fun publishPlaybackQueue() {
        val sessionQueue = playbackQueue.mapIndexed { idx, item ->
            val desc = MediaDescriptionCompat.Builder()
                .setMediaId(item.trackId)
                .setTitle(item.title)
                .setSubtitle(item.artist)
                .apply {
                    if (!item.coverArtUrl.isNullOrBlank()) {
                        setIconUri(android.net.Uri.parse(item.coverArtUrl))
                    }
                }
                .build()
            MediaSessionCompat.QueueItem(desc, idx.toLong())
        }
        mediaSession.setQueue(sessionQueue)
        mediaSession.setQueueTitle("Now Playing")
    }

    private fun mergeKnownMeta(items: List<QueueItem>) {
        val metaMap = mutableMapOf<String, Pair<String, String>>()
        for (item in items) {
            val meta = item.title to item.artist
            metaMap[item.trackId] = meta
            metaMap[normalizeMediaId(item.trackId)] = meta
            if (item.streamUrl.isNotBlank()) {
                metaMap[item.streamUrl] = meta
                metaMap[normalizeMediaId(item.streamUrl)] = meta
            }
        }
        val nextMap = lastKnownMetaById.toMutableMap()
        nextMap.putAll(metaMap)
        if (nextMap.size > 2000) {
            val keysToKeep = nextMap.keys.toList().takeLast(1000)
            lastKnownMetaById = nextMap.filterKeys { it in keysToKeep }.toMap()
        } else {
            lastKnownMetaById = nextMap.toMap()
        }
    }

    // ── Playback (main thread) ───────────────────────────────────────────────

    /**
     * Load and play the track at [index]. Always called on the main thread.
     */
    private fun playAt(index: Int) {
        if (playbackQueue.isEmpty() || index !in playbackQueue.indices) return
        playbackIndex = index
        val qi = playbackQueue[index]
        val fallbackBitmap = defaultCoverBitmap()
        val hasRemoteCover = !qi.coverArtUrl.isNullOrBlank() && !qi.coverArtUrl.startsWith("android.resource://")

        stopTrackPlayerServiceIfRunning()
        player.stop()
        player.clearMediaItems()
        player.setMediaItem(Media3Item.fromUri(android.net.Uri.parse(qi.streamUrl)))
        player.prepare()
        player.playWhenReady = true
        player.play()
        scheduleStallWatchdog()
        scrobbleSubmissionId = null
        sendScrobble(qi.trackId, false)

        // Always show the fallback disk initially to prevent black screens.
        currentNowPlayingBitmap = fallbackBitmap
        applyNowPlayingArt(qi, currentNowPlayingBitmap)
        mediaSession.setQueueTitle("Now Playing")
        mediaSession.setPlaybackState(buildState(PlaybackStateCompat.STATE_BUFFERING, 0L))
        startForegroundWithNotification(qi.title, qi.artist, currentNowPlayingBitmap)

        // Upgrade artwork asynchronously: keep fallback visible immediately,
        // then swap in remote bitmap if available.
        val coverUrl = qi.coverArtUrl
        if (hasRemoteCover && !coverUrl.isNullOrBlank()) {
            serviceScope.launch {
                val remoteBitmap = fetchCoverBitmap(coverUrl)
                mainHandler.post {
                    val stillCurrent = playbackQueue.getOrNull(playbackIndex)?.trackId == qi.trackId
                    if (!stillCurrent) return@post
                    if (remoteBitmap != null) {
                        currentNowPlayingBitmap = remoteBitmap
                        applyNowPlayingArt(qi, currentNowPlayingBitmap)
                        startForegroundWithNotification(qi.title, qi.artist, currentNowPlayingBitmap)
                    } else {
                        // Remote decode failed: fall back to disk.
                        currentNowPlayingBitmap = fallbackBitmap
                        applyNowPlayingArt(qi, currentNowPlayingBitmap)
                        startForegroundWithNotification(qi.title, qi.artist, currentNowPlayingBitmap)
                    }
                }
            }
        }

        // Pre-warm the next 2 tracks in the queue so the server starts
        // downloading them while the current track is playing.
        serviceScope.launch { warmNextTracks(index) }
    }

    /**
     * Fire a bytes=0-0 range request for the next [count] tracks in the queue.
     * This hits /rest/stream which triggers an on-demand download on the
     * server at high priority — identical to the JS client warmNextTracks().
     * Runs on IO thread; completely fire-and-forget.
     */
    private fun warmNextTracks(currentIndex: Int, count: Int = 2) {
        warmTracks(playbackQueue, currentIndex, count)
    }

    private fun warmTracks(snapshot: List<QueueItem>, currentIndex: Int, count: Int = 2) {
        if (snapshot.isEmpty()) return
        val toWarm = snapshot.subList(
            (currentIndex + 1).coerceAtMost(snapshot.size),
            (currentIndex + 1 + count).coerceAtMost(snapshot.size)
        )
        for (item in toWarm) {
            if (item.streamUrl.isBlank()) continue
            try {
                val conn = (URL(item.streamUrl).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    setRequestProperty("Range", "bytes=0-0")
                    connectTimeout = 3000
                    readTimeout = 3000
                    connect()
                }
                conn.disconnect()
                android.util.Log.d(TAG, "[Warm] Triggered pre-download for: ${item.title}")
            } catch (e: Exception) {
                // Best-effort — never block playback
                android.util.Log.d(TAG, "[Warm] Pre-download ping failed for ${item.trackId}: ${e.message}")
            }
        }
    }

    private fun applyNowPlayingArt(qi: QueueItem, bitmap: Bitmap?) {
        val durationMs = player.duration.takeIf { it > 0 } ?: 0L
        mediaSession.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, qi.trackId)
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, qi.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, qi.artist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
                .apply {
                    if (bitmap != null) {
                        // If we supply a raw Bitmap, DO NOT supply the URI. Android Auto caches by URI 
                        // and will blatantly ignore the updated Bitmap if the URI string hasn't changed!
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ART, bitmap)
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap)
                        putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, bitmap)
                    } else if (!qi.coverArtUrl.isNullOrBlank()) {
                        putString(MediaMetadataCompat.METADATA_KEY_ART_URI, qi.coverArtUrl)
                        putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, qi.coverArtUrl)
                        putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, qi.coverArtUrl)
                    }
                }
                .build()
        )

        // Keep MediaSession queue as the logical playback queue (not single-item now playing)
        // so Android Auto queue view and next/previous controls stay enabled.
        publishPlaybackQueue()
    }

    // ── MediaSession callback (main thread — called by MediaSession internally) ──

    private inner class SessionCallback : MediaSessionCompat.Callback() {
        private fun playFirstFromQueue(): Boolean {
            if (playbackQueue.isEmpty()) {
                android.util.Log.w(TAG, "playFirstFromQueue: playbackQueue empty")
                return false
            }
            playAt(playbackIndex.coerceIn(0, playbackQueue.lastIndex))
            return true
        }

        private fun findTrackIndexInQueue(items: List<QueueItem>, rawId: String, normalizedId: String): Int? {
            return items.indexOfFirst { it.trackId == rawId || it.trackId == normalizedId }
                .takeIf { it >= 0 }
                ?: items.indexOfFirst { it.streamUrl == rawId || it.streamUrl == normalizedId }.takeIf { it >= 0 }
                ?: items.indexOfFirst { normalizeMediaId(it.trackId) == normalizedId }.takeIf { it >= 0 }
                ?: items.indexOfFirst { normalizeMediaId(it.streamUrl) == normalizedId }.takeIf { it >= 0 }
        }

        private fun resolveAndPlayMediaId(mediaId: String?, extras: Bundle?): Boolean {
            val rawId = mediaId?.trim() ?: return false
            if (rawId.isBlank()) return false

            // Shuffle item: randomise the queue and play from the top
            if (rawId == "__shuffle__") {
                val base = if (browsedQueue.isNotEmpty()) browsedQueue else playbackQueue
                if (base.isEmpty()) return false
                val source = browsedQueueSource ?: playbackQueueSource ?: "shuffle"
                setPlaybackQueue(base.shuffled(), 0, source)
                playAt(0)
                return true
            }

            if (rawId == "top_songs" || rawId == "random") {
                val config = getConfig() ?: return false
                serviceScope.launch {
                    val nextQueue = if (rawId == "top_songs") fetchTopSongsQueue(config) else fetchRandomQueue(config)
                    mainHandler.post {
                        if (nextQueue.isNotEmpty()) {
                            setPlaybackQueue(nextQueue, 0, rawId)
                            playAt(0)
                        }
                    }
                }
                return true
            }

            // Playlist tap: AA sometimes sends onPlayFromMediaId("playlist/drift-radio")
            // directly when the user taps a playlist item without browsing into it first.
            // Load the playlist tracks on-demand and start from index 0.
            if (rawId.startsWith("playlist/")) {
                val playlistId = rawId.removePrefix("playlist/")
                val config = getConfig() ?: return false
                serviceScope.launch {
                    val items = fetchPlaylistQueue(config, playlistId)
                    mainHandler.post {
                        if (items.isNotEmpty()) {
                            setPlaybackQueue(items, 0, rawId)
                            playAt(0)
                        }
                    }
                }
                return true
            }

            val normalizedId = normalizeMediaId(rawId)
            android.util.Log.d(TAG, "resolveAndPlayMediaId: raw=$rawId normalized=$normalizedId playbackSize=${playbackQueue.size} browsedSize=${browsedQueue.size}")

            val playbackIdx = findTrackIndexInQueue(playbackQueue, rawId, normalizedId)
                ?: playbackIndexByTrackId[rawId]
                ?: playbackIndexByTrackId[normalizedId]
                ?: playbackIndexByTrackId.entries.firstOrNull { normalizeMediaId(it.key) == normalizedId }?.value
            if (playbackIdx != null) {
                playAt(playbackIdx)
                return true
            }

            val browsedIdx = findTrackIndexInQueue(browsedQueue, rawId, normalizedId)
            if (browsedIdx != null) {
                setPlaybackQueue(browsedQueue, browsedIdx, browsedQueueSource ?: "browsed")
                playAt(browsedIdx)
                return true
            }

            // Android Auto can sometimes send non-stable mediaIds for playable children.
            // If we have a browsed list context, preserve full queue progression by matching
            // from metadata before collapsing to a 1-item fallback queue.
            val titleExt = extras?.getString("android.media.metadata.TITLE")
            val artistExt = extras?.getString("android.media.metadata.ARTIST")
            if (browsedQueue.isNotEmpty()) {
                val idxFromMeta = browsedQueue.indexOfFirst { item ->
                    val titleMatch = !titleExt.isNullOrBlank() && item.title.equals(titleExt, ignoreCase = true)
                    val artistMatch = artistExt.isNullOrBlank() || item.artist.equals(artistExt, ignoreCase = true)
                    titleMatch && artistMatch
                }
                if (idxFromMeta >= 0) {
                    setPlaybackQueue(browsedQueue, idxFromMeta, browsedQueueSource ?: "browsed")
                    playAt(idxFromMeta)
                    return true
                }

                if (browsedQueueSource == "random") {
                    // Random Mix safety: keep multi-track queue alive even if AA mediaId mismatch occurs.
                    setPlaybackQueue(browsedQueue, 0, "random")
                    playAt(0)
                    return true
                }
            }

            // Fallback: play directly from tapped mediaId even if queue got out of sync.
            val config = getConfig() ?: return false
            val resolvedStreamUrl = if (rawId.startsWith("http://") || rawId.startsWith("https://")) {
                rawId
            } else {
                "${config.serverUrl}/rest/stream.view?id=$normalizedId&${streamAuthParams(config)}"
            }
            val cachedMeta = lastKnownMetaById[rawId] ?: lastKnownMetaById[normalizedId]
            if (cachedMeta != null) {
                setPlaybackQueue(
                    listOf(
                    QueueItem(
                        streamUrl = resolvedStreamUrl,
                        trackId = normalizedId,
                        title = cachedMeta.first,
                        artist = cachedMeta.second,
                    )
                    ),
                    0,
                    "fallback-single"
                )
                playAt(0)
                return true
            }

            serviceScope.launch {
                val fallbackMeta = fetchSongMetadata(config, normalizedId)
                mainHandler.post {
                    setPlaybackQueue(
                        listOf(
                            QueueItem(
                                streamUrl = resolvedStreamUrl,
                                trackId = normalizedId,
                                title = fallbackMeta?.first ?: titleExt ?: normalizedId,
                                artist = fallbackMeta?.second ?: artistExt ?: "",
                            )
                        ),
                        0,
                        "fallback-single"
                    )
                    playAt(0)
                }
            }
            return true
        }

        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
            android.util.Log.d(TAG, "onPlayFromMediaId: $mediaId")
            if (!resolveAndPlayMediaId(mediaId, extras)) {
                android.util.Log.w(TAG, "onPlayFromMediaId ignored (unresolvable id): $mediaId")
            }
        }

        override fun onPrepareFromMediaId(mediaId: String?, extras: Bundle?) {
            android.util.Log.d(TAG, "onPrepareFromMediaId: $mediaId")
            if (!resolveAndPlayMediaId(mediaId, extras)) {
                android.util.Log.w(TAG, "onPrepareFromMediaId ignored (unresolvable id): $mediaId")
            }
        }

        override fun onPlayFromSearch(query: String?, extras: Bundle?) {
            android.util.Log.d(TAG, "onPlayFromSearch: query=$query")
            if (!playFirstFromQueue()) {
                super.onPlayFromSearch(query, extras)
            }
        }

        override fun onPrepareFromSearch(query: String?, extras: Bundle?) {
            android.util.Log.d(TAG, "onPrepareFromSearch: query=$query")
            if (!playFirstFromQueue()) {
                super.onPrepareFromSearch(query, extras)
            }
        }

        override fun onPlayFromUri(uri: android.net.Uri?, extras: Bundle?) {
            val raw = uri?.toString()
            android.util.Log.d(TAG, "onPlayFromUri: $raw")
            if (!resolveAndPlayMediaId(raw, extras) && !playFirstFromQueue()) {
                super.onPlayFromUri(uri, extras)
            }
        }

        override fun onPrepareFromUri(uri: android.net.Uri?, extras: Bundle?) {
            val raw = uri?.toString()
            android.util.Log.d(TAG, "onPrepareFromUri: $raw")
            if (!resolveAndPlayMediaId(raw, extras) && !playFirstFromQueue()) {
                super.onPrepareFromUri(uri, extras)
            }
        }

        override fun onPlay() {
            android.util.Log.d(TAG, "onPlay: mediaItemCount=${player.mediaItemCount} playbackSize=${playbackQueue.size} playbackIndex=$playbackIndex source=$playbackQueueSource")
            if (player.mediaItemCount == 0 && playbackQueue.isNotEmpty()) {
                playAt(playbackIndex.coerceIn(0, playbackQueue.lastIndex))
                return
            }
            player.play()
        }

        override fun onPause() {
            player.pause()
        }

        override fun onSkipToNext() {
            if (playbackIndex < playbackQueue.size - 1) playAt(playbackIndex + 1)
        }

        override fun onSkipToPrevious() {
            when {
                player.currentPosition > 3000 -> player.seekTo(0)
                playbackIndex > 0             -> playAt(playbackIndex - 1)
                else                          -> player.seekTo(0)
            }
        }

        override fun onSeekTo(pos: Long) {
            player.seekTo(pos)
        }

        override fun onStop() {
            player.stop()
            mediaSession.isActive = false
            stopForegroundCompat()
            stopSelf()
        }
    }

    // ── ExoPlayer listener → MediaSession sync (main thread) ─────────────────

    private inner class ExoPlayerListener : Player.Listener {

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            val pos = player.currentPosition
            val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING
                        else          PlaybackStateCompat.STATE_PAUSED
            mediaSession.setPlaybackState(buildState(state, pos))
            if (isPlaying) {
                clearStallWatchdog()
            }
            if (isPlaying) {
                progressTickerRunning = true
                mainHandler.removeCallbacks(progressTicker)
                mainHandler.post(progressTicker)
            } else {
                progressTickerRunning = false
                mainHandler.removeCallbacks(progressTicker)
            }
            if (isPlaying) {
                val qi = playbackQueue.getOrNull(playbackIndex) ?: return
                startForegroundWithNotification(qi.title, qi.artist, currentNowPlayingBitmap)
            }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            when (playbackState) {
                Player.STATE_BUFFERING ->
                    mediaSession.setPlaybackState(
                        buildState(PlaybackStateCompat.STATE_BUFFERING, player.currentPosition)
                    )
                Player.STATE_READY -> {
                    clearStallWatchdog()
                    val qi = playbackQueue.getOrNull(playbackIndex)
                    if (qi != null) {
                        // Refresh duration while preserving current artwork bitmap.
                        applyNowPlayingArt(qi, currentNowPlayingBitmap)
                    }
                }
                Player.STATE_ENDED -> {
                    clearStallWatchdog()
                    progressTickerRunning = false
                    mainHandler.removeCallbacks(progressTicker)
                    if (playbackIndex < playbackQueue.size - 1) {
                        playAt(playbackIndex + 1)
                    } else {
                        mediaSession.setPlaybackState(
                            buildState(PlaybackStateCompat.STATE_STOPPED, 0L)
                        )
                        stopForegroundCompat()
                    }
                }
                else -> Unit
            }
        }

        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            android.util.Log.e(TAG, "ExoPlayer Error: ${error.message}. Skipping in 2s.")
            clearStallWatchdog()
            mediaSession.setPlaybackState(buildState(PlaybackStateCompat.STATE_ERROR, player.currentPosition))
            mainHandler.postDelayed({
                if (playbackIndex < playbackQueue.size - 1) {
                    playAt(playbackIndex + 1)
                } else {
                    mediaSession.setPlaybackState(buildState(PlaybackStateCompat.STATE_STOPPED, 0L))
                    stopForegroundCompat()
                }
            }, 2000)
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun buildState(state: Int, positionMs: Long): PlaybackStateCompat =
        PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_SEEK_TO or
                PlaybackStateCompat.ACTION_STOP
            )
            .setState(state, positionMs, 1f)
            .build()

    private fun scheduleStallWatchdog() {
        clearStallWatchdog()
        stallWatchdog = Runnable {
            if (!isStalled()) return@Runnable
            stallConfirm = Runnable {
                if (!isStalled()) return@Runnable
                android.util.Log.w(TAG, "Stall watchdog: skipping stuck track")
                if (playbackIndex < playbackQueue.size - 1) {
                    playAt(playbackIndex + 1)
                } else {
                    mediaSession.setPlaybackState(buildState(PlaybackStateCompat.STATE_STOPPED, 0L))
                    stopForegroundCompat()
                }
            }
            mainHandler.postDelayed(stallConfirm!!, 2000)
        }
        mainHandler.postDelayed(stallWatchdog!!, 20000)
    }

    private fun clearStallWatchdog() {
        stallWatchdog?.let { mainHandler.removeCallbacks(it) }
        stallConfirm?.let { mainHandler.removeCallbacks(it) }
        stallWatchdog = null
        stallConfirm = null
    }

    private fun isStalled(): Boolean {
        val loading = player.playbackState == Player.STATE_BUFFERING || player.playbackState == Player.STATE_IDLE
        val notPlaying = !player.isPlaying
        val pos = player.currentPosition
        return loading && notPlaying && pos < 1000 && player.mediaItemCount > 0
    }

    private fun maybeScrobbleSubmission() {
        val qi = playbackQueue.getOrNull(playbackIndex) ?: return
        if (scrobbleSubmissionId == qi.trackId) return
        val duration = player.duration
        if (duration == C.TIME_UNSET || duration <= 0) return
        if (player.currentPosition >= duration / 2) {
            scrobbleSubmissionId = qi.trackId
            sendScrobble(qi.trackId, true)
        }
    }

    private fun sendScrobble(trackId: String, submission: Boolean) {
        serviceScope.launch {
            val config = getConfig() ?: return@launch
            val encodedId = URLEncoder.encode(trackId, Charsets.UTF_8.name())
            val url = apiUrl(config, "scrobble", "id=$encodedId&submission=${if (submission) "true" else "false"}")
            fetch(url)
        }
    }

    private fun browseItem(
        id: String,
        title: String,
        subtitle: String,
        iconUrl: String? = null,
    ): MediaBrowserCompat.MediaItem {
        val desc = MediaDescriptionCompat.Builder()
            .setMediaId(id)
            .setTitle(title)
            .setSubtitle(subtitle)
            .apply { if (iconUrl != null) setIconUri(android.net.Uri.parse(iconUrl)) }
            .build()
        return MediaBrowserCompat.MediaItem(desc, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE)
    }

    private fun playableItem(qi: QueueItem): MediaBrowserCompat.MediaItem {
        val desc = MediaDescriptionCompat.Builder()
            .setMediaId(qi.trackId)
            .setTitle(qi.title)
            .setSubtitle(qi.artist)
            .apply { if (!qi.coverArtUrl.isNullOrBlank()) setIconUri(android.net.Uri.parse(qi.coverArtUrl)) }
            .build()
        return MediaBrowserCompat.MediaItem(desc, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)
    }

    private fun songToQueueItem(config: ServerConfig, s: JSONObject): QueueItem {
        val id     = s.optString("id")
        val title  = s.optString("title", id).ifBlank { id }
        val artist = s.optString("artist", "")
        val coverId =
            s.optString("coverArt").ifBlank {
                s.optString("albumId").ifBlank {
                    id.ifBlank { "" }
                }
            }.ifBlank { null }
        val cover  = coverUrl(config, coverId) ?: defaultCoverUrl()
        val url    = if (id.isBlank()) "" else
            "${config.serverUrl}/rest/stream.view?id=$id&${streamAuthParams(config)}"
        return QueueItem(streamUrl = url, trackId = id, title = title, artist = artist, coverArtUrl = cover)
    }

    private fun resolvePlaylistCover(config: ServerConfig, playlistId: String, playlistCoverArt: String?): String? {
        if (!playlistCoverArt.isNullOrBlank()) {
            return coverUrl(config, playlistCoverArt)
        }

        val playlistResp = fetch(apiUrl(config, "getPlaylist", "id=$playlistId")) ?: return null
        val entries = jsonArrayOrSingle(playlistResp.optJSONObject("playlist")?.opt("entry")) ?: return null
        if (entries.length() == 0) return null

        for (i in 0 until entries.length()) {
            val s = entries.optJSONObject(i) ?: continue
            val fallbackId =
                s.optString("coverArt").ifBlank {
                    s.optString("albumId").ifBlank {
                        s.optString("id").ifBlank { "" }
                    }
                }.ifBlank { null }
            if (!fallbackId.isNullOrBlank()) {
                return coverUrl(config, fallbackId)
            }
        }
        return defaultCoverUrl()
    }

    private fun normalizeMediaId(raw: String): String {
        val decoded = try {
            URLDecoder.decode(raw, Charsets.UTF_8.name())
        } catch (_: Exception) {
            raw
        }

        try {
            if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
                val uri = android.net.Uri.parse(decoded)
                val id = uri.getQueryParameter("id")
                if (!id.isNullOrBlank()) return id
            }
        } catch (_: Exception) {}

        return decoded.substringAfterLast('/').substringBefore('?').ifBlank { decoded }
    }

    private fun fetchSongMetadata(config: ServerConfig, songId: String): Pair<String?, String?>? {
        if (songId.isBlank()) return null
        val response = fetch(apiUrl(config, "getSong", "id=$songId")) ?: return null
        val song = response.optJSONObject("song") ?: return null
        val title = song.optString("title", "").ifBlank { null }
        val artist = song.optString("artist", "").ifBlank { null }
        return title to artist
    }

    private fun stopTrackPlayerServiceIfRunning() {
        try {
            val cls = Class.forName("com.doublesymmetry.trackplayer.service.MusicService")
            @Suppress("UNCHECKED_CAST")
            stopService(Intent(this, cls as Class<*>))
        } catch (_: ClassNotFoundException) {
            // TrackPlayer service class not available in this build.
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Failed stopping TrackPlayer service: ${e.message}")
        }
    }

    private fun jsonArrayOrSingle(value: Any?): JSONArray? {
        return when (value) {
            is JSONArray -> value
            is JSONObject -> JSONArray().put(value)
            else -> null
        }
    }

    // ── Foreground notification ───────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Drift Car Playback",
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Android Auto playback controls" }
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(title: String, artist: String, largeIcon: Bitmap? = null): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(artist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .apply {
                if (largeIcon != null) {
                    setLargeIcon(largeIcon)
                }
            }
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSilent(true)
            .setOngoing(true)
            .setStyle(
                androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0)
            )
            .build()

    private fun startForegroundWithNotification(title: String, artist: String, largeIcon: Bitmap? = null) {
        startForeground(NOTIFICATION_ID, buildNotification(title, artist, largeIcon))
    }

    @Suppress("DEPRECATION")
    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
    }

    // ── Server config ─────────────────────────────────────────────────────────

    private data class ServerConfig(
        val serverUrl: String,
        val username: String,
        val password: String,
    )

    /**
     * @react-native-async-storage stores data in an SQLite database (RKStorage),
     * NOT in SharedPreferences. Read the key directly from the DB.
     */
    private fun getConfig(): ServerConfig? {
        try {
            val dbPath = getDatabasePath("RKStorage").absolutePath
            android.util.Log.d(TAG, "getConfig: opening DB at $dbPath")
            val db = android.database.sqlite.SQLiteDatabase.openDatabase(
                dbPath, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY
            )
            val raw = db.use { d ->
            d.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf(CONFIG_KEY)
            ).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }
        if (raw == null) {
            android.util.Log.e(TAG, "getConfig: key '$CONFIG_KEY' not found in DB")
            return null
        }
        val j = JSONObject(raw)
        val url = j.optString("serverUrl", "").trimEnd('/')
        if (url.isBlank()) {
            android.util.Log.e(TAG, "getConfig: serverUrl is blank")
            return null
        }
        android.util.Log.d(TAG, "getConfig: loaded serverUrl=$url")
        return ServerConfig(
            serverUrl = url,
            username  = j.optString("username", ""),
            password  = j.optString("password", ""),
        )
        } catch (e: Exception) {
            android.util.Log.e(TAG, "getConfig failed: ${e.message}")
            return null
        }
    }

    private fun md5(input: String): String {
        val bytes = MessageDigest.getInstance("MD5").digest(input.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun baseAuthParams(config: ServerConfig): String {
        val salt  = "drift"
        val token = md5(config.password + salt)
        return "u=${config.username}&t=$token&s=$salt&v=1.16.1&c=drift-android-auto"
    }

    private fun apiAuthParams(config: ServerConfig): String {
        return "${baseAuthParams(config)}&f=json"
    }

    private fun streamAuthParams(config: ServerConfig): String {
        // Stream endpoint should not force JSON response format.
        return baseAuthParams(config)
    }

    private fun apiUrl(config: ServerConfig, method: String, extra: String = ""): String {
        val base = "${config.serverUrl}/rest/$method.view?${apiAuthParams(config)}"
        return if (extra.isNotEmpty()) "$base&$extra" else base
    }

    private fun coverUrl(config: ServerConfig, id: String?): String? {
        if (id.isNullOrBlank()) return null
        val encodedId = URLEncoder.encode(id, Charsets.UTF_8.name())
        // Cover art endpoint returns binary image; do not include f=json.
        return "${config.serverUrl}/rest/getCoverArt?id=$encodedId&size=300&${streamAuthParams(config)}"
    }

    private fun defaultCoverUrl(): String {
        return "android.resource://$packageName/${R.drawable.drift_disk_fallback}"
    }

    private fun defaultCoverBitmap() =
        BitmapFactory.decodeResource(resources, R.drawable.drift_disk_fallback)

    private fun fetchCoverBitmap(url: String): Bitmap? = try {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 15000
            instanceFollowRedirects = true
        }
        conn.inputStream.use { BitmapFactory.decodeStream(it) }
    } catch (_: Exception) {
        null
    }

    private fun fetch(url: String): JSONObject? = try {
        val text = URL(url).readText()
        JSONObject(text).optJSONObject("subsonic-response")
    } catch (e: Exception) { null }
}
