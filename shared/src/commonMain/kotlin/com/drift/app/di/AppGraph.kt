package com.drift.app.di

import com.drift.app.api.SubsonicClient
import com.drift.app.api.SubsonicSource
import com.drift.app.data.*
import com.drift.app.platform.PlatformDeps
import com.drift.app.player.*
import com.drift.app.source.LocalSource
import com.drift.app.source.SourceRouter
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/** Hand-rolled service locator. Created once per process (Application.onCreate / iOS App.init). */
object AppGraph {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    lateinit var prefs: AppPrefs; private set
    lateinit var cache: QueryCache; private set
    lateinit var remote: SubsonicSource; private set
    lateinit var local: LocalSource; private set
    lateinit var router: SourceRouter; private set
    lateinit var downloads: DownloadManager; private set
    lateinit var resolver: PlaybackResolver; private set
    lateinit var engine: PlaybackEngine; private set
    lateinit var player: PlayerController; private set
    lateinit var actions: LibraryActions; private set
    private var started = false

    fun init(deps: PlatformDeps) {
        if (started) return
        started = true
        prefs = AppPrefs(deps.settings, deps.secureSettings)
        cache = QueryCache()
        remote = SubsonicSource(SubsonicClient { prefs.config.value }) { prefs.maxBitRate.value }
        local = LocalSource(deps.scanner, deps.settings)
        router = SourceRouter(remote, local, prefs)
        downloads = DownloadManager(deps.filesDir, remote, scope)
        resolver = PlaybackResolver(router, downloads)
        engine = deps.engineFactory(scope)
        player = PlayerController(engine, resolver, prefs, scope)
        actions = LibraryActions(router, downloads, prefs, cache, scope)
        Scrobbler(engine, router, prefs, scope).start()

        // Anything that changes *what* the library contains → drop cached screens.
        scope.launch {
            combine(prefs.mode, prefs.showDeviceMusic, prefs.config) { a, b, c -> Triple(a, b, c) }
                .drop(1).collect { cache.invalidate(); refreshLibraryState() }
        }
        scope.launch { refreshLibraryState() }
    }

    /** Re-scan device music (if enabled) and refresh favourites. Safe to call repeatedly. */
    suspend fun refreshLibraryState() {
        if (router.localActive && local.hasPermission()) runCatching { local.ensureScanned() }
        if (router.remoteActive || router.localActive) actions.refreshStarred()
    }

    fun signOut() {
        player.stop()
        downloads.removeAll()
        prefs.clearServer()
        prefs.setMode(null)
        prefs.setShowDeviceMusic(false)
        cache.invalidate()
    }
}
