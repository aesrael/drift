package com.drift.app.player

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.BitmapLoader
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceBitmapLoader
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.*
import com.drift.app.di.AppGraph
import com.drift.app.model.Song
import com.drift.app.platform.DeviceArt
import com.drift.shared.R
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.*
import kotlinx.coroutines.guava.future
import java.util.concurrent.Executors

private const val ROOT = "root"
private const val SEP = '\u001f'

/**
 * The only audio component on Android. Phone UI, lock-screen/notification, Bluetooth/headset buttons,
 * Android Auto, Wear and Google Assistant all talk to this one session, so there is exactly one queue.
 *
 * Browse tree (Android Auto):
 *   Recently played / Newly added / Most played  → albums → songs
 *   Playlists → songs;  Favourites;  Random mix;  Downloads
 */
@OptIn(UnstableApi::class)
class DriftPlaybackService : MediaLibraryService() {
    private var session: MediaLibrarySession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val browseCache = HashMap<String, List<Song>>()

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setBitmapLoader(DriftBitmapLoader())
            .apply { open?.let { setSessionActivity(it) } }
            .build()
        setMediaNotificationProvider(DefaultMediaNotificationProvider.Builder(this).build().also { it.setSmallIcon(R.drawable.ic_notification) })
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping the app away while paused ends the service; while playing, music continues.
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        session?.run { player.release(); release() }
        session = null
        super.onDestroy()
    }

    // ---- browse tree --------------------------------------------------------------------------------------------

    private fun folder(id: String, title: String, type: Int = MediaMetadata.MEDIA_TYPE_FOLDER_MIXED, art: String? = null): MediaItem =
        MediaItem.Builder().setMediaId(id).setMediaMetadata(
            MediaMetadata.Builder().setTitle(title).setIsBrowsable(true).setIsPlayable(false).setMediaType(type)
                .setArtworkUri(art?.let(Uri::parse)).build(),
        ).build()

    private fun browseSong(ctx: String, s: Song): MediaItem =
        MediaItem.Builder().setMediaId("song$SEP$ctx$SEP${s.id}").setMediaMetadata(
            MediaMetadata.Builder().setTitle(s.title).setArtist(s.artist).setAlbumTitle(s.album)
                .setArtworkUri(s.coverArt?.let { AppGraph.router.coverArtUrl(it, 300) }?.let(Uri::parse))
                .setIsBrowsable(false).setIsPlayable(true).setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC).build(),
        ).build()

    private suspend fun songsFor(ctx: String): List<Song> {
        val g = AppGraph
        return when {
            ctx.startsWith("album:") -> g.router.album(ctx.removePrefix("album:")).songs
            ctx.startsWith("playlist:") -> g.router.playlist(ctx.removePrefix("playlist:")).songs
            ctx == "list:starred" -> g.router.starred().songs
            ctx == "list:downloads" -> g.downloads.entries.value.values.sortedByDescending { it.at }.map { it.song }
            ctx == "list:random" -> browseCache[ctx] ?: g.router.randomSongs(50)
            else -> emptyList()
        }.also { if (ctx == "list:random") browseCache[ctx] = it }
    }

    private suspend fun children(parentId: String): List<MediaItem> {
        val g = AppGraph
        return when {
            parentId == ROOT -> listOf(
                folder("albums:recent", "Recently played", MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS),
                folder("albums:newest", "Newly added", MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS),
                folder("albums:frequent", "Most played", MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS),
                folder("playlists", "Playlists", MediaMetadata.MEDIA_TYPE_FOLDER_PLAYLISTS),
                folder("list:starred", "Favourites", MediaMetadata.MEDIA_TYPE_PLAYLIST),
                folder("list:random", "Random mix", MediaMetadata.MEDIA_TYPE_PLAYLIST),
                folder("list:downloads", "Downloads", MediaMetadata.MEDIA_TYPE_PLAYLIST),
            )
            parentId.startsWith("albums:") -> {
                val type = com.drift.app.model.AlbumListType.entries.first { it.api == parentId.removePrefix("albums:") }
                g.router.albumList(type, 30).map { folder("album:${it.id}", it.name, MediaMetadata.MEDIA_TYPE_ALBUM, it.coverArt?.let { c -> g.router.coverArtUrl(c, 300) }) }
            }
            parentId == "playlists" -> g.router.playlists().map { folder("playlist:${it.id}", it.name, MediaMetadata.MEDIA_TYPE_PLAYLIST, it.coverArt?.let { c -> g.router.coverArtUrl(c, 300) }) }
            else -> {
                if (parentId == "list:random") browseCache.remove(parentId) // fresh mix each time the folder is opened
                songsFor(parentId).map { browseSong(parentId, it) }
            }
        }
    }

    /** Turn whatever a controller sent (browse ids, search queries, ready-made items) into playable items. */
    private suspend fun resolve(items: List<MediaItem>, startIndex: Int, startPos: Long): MediaSession.MediaItemsWithStartPosition {
        val g = AppGraph
        val first = items.firstOrNull()
        if (items.size == 1 && first != null && first.localConfiguration == null) {
            val query = first.requestMetadata.searchQuery
            if (!query.isNullOrBlank()) { // "Hey Google, play …"
                val songs = g.router.search(query, songCount = 30, albumCount = 0, artistCount = 0).songs
                val playable = songs.mapNotNull { g.resolver.item(it)?.toMediaItem() }
                return MediaSession.MediaItemsWithStartPosition(playable, 0, C.TIME_UNSET)
            }
            val parts = first.mediaId.split(SEP)
            if (parts.size == 3 && parts[0] == "song") {
                val songs = songsFor(parts[1]).ifEmpty { listOf(g.router.song(parts[2])) }
                val playable = songs.mapNotNull { g.resolver.item(it)?.toMediaItem() }
                return MediaSession.MediaItemsWithStartPosition(playable, playable.indexOfFirst { it.mediaId == parts[2] }.coerceAtLeast(0), C.TIME_UNSET)
            }
        }
        return MediaSession.MediaItemsWithStartPosition(items.map { resolveOne(it) }, startIndex, startPos)
    }

    private suspend fun resolveOne(item: MediaItem): MediaItem {
        if (item.localConfiguration != null) return item
        val g = AppGraph
        return g.resolver.item(g.router.song(item.mediaId))?.toMediaItem() ?: throw UnsupportedOperationException("Not playable: ${item.mediaId}")
    }

    private inner class LibraryCallback : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, params: MediaLibraryService.LibraryParams?) =
            Futures.immediateFuture(LibraryResult.ofItem(folder(ROOT, "Drift"), params))

        override fun onGetChildren(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, parentId: String, page: Int, pageSize: Int,
            params: MediaLibraryService.LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = scope.future {
            try {
                val all = children(parentId)
                LibraryResult.ofItemList(ImmutableList.copyOf(all.drop(page * pageSize).take(pageSize)), params)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                LibraryResult.ofError(LibraryResult.RESULT_ERROR_UNKNOWN)
            }
        }

        override fun onGetItem(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, mediaId: String): ListenableFuture<LibraryResult<MediaItem>> = scope.future {
            try {
                val parts = mediaId.split(SEP)
                if (parts.size == 3 && parts[0] == "song") LibraryResult.ofItem(browseSong(parts[1], AppGraph.router.song(parts[2])), null)
                else LibraryResult.ofItem(folder(mediaId, mediaId), null)
            } catch (e: CancellationException) { throw e } catch (e: Exception) { LibraryResult.ofError(LibraryResult.RESULT_ERROR_UNKNOWN) }
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>, startIndex: Int, startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = scope.future { resolve(mediaItems, startIndex, startPositionMs) }

        override fun onAddMediaItems(mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>): ListenableFuture<MutableList<MediaItem>> =
            scope.future { resolve(mediaItems, 0, C.TIME_UNSET).mediaItems.toMutableList() }

        override fun onSearch(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String, params: MediaLibraryService.LibraryParams?): ListenableFuture<LibraryResult<Void>> {
            session.notifySearchResultChanged(browser, query, 30, params)
            return Futures.immediateFuture(LibraryResult.ofVoid())
        }

        override fun onGetSearchResult(session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String, page: Int, pageSize: Int, params: MediaLibraryService.LibraryParams?): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = scope.future {
            try {
                val songs = AppGraph.router.search(query, songCount = 30, albumCount = 0, artistCount = 0).songs
                browseCache["search"] = songs
                LibraryResult.ofItemList(ImmutableList.copyOf(songs.map { browseSong("search", it) }), params)
            } catch (e: CancellationException) { throw e } catch (e: Exception) { LibraryResult.ofError(LibraryResult.RESULT_ERROR_UNKNOWN) }
        }
    }

    /** Default loader for https artwork; device songs use embedded art via MediaStore. */
    private inner class DriftBitmapLoader : BitmapLoader {
        private val delegate = CacheBitmapLoader(DataSourceBitmapLoader(this@DriftPlaybackService))
        private val io = MoreExecutors.listeningDecorator(Executors.newSingleThreadExecutor())
        override fun supportsMimeType(mimeType: String) = delegate.supportsMimeType(mimeType)
        override fun decodeBitmap(data: ByteArray) = delegate.decodeBitmap(data)
        override fun loadBitmap(uri: Uri): ListenableFuture<Bitmap> =
            if (uri.scheme == "devicecover") io.submit<Bitmap> {
                DeviceArt.bitmap(this@DriftPlaybackService, uri.authority ?: "") ?: throw IllegalStateException("no artwork")
            } else delegate.loadBitmap(uri)
    }
}
