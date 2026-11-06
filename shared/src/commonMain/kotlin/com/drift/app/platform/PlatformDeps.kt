package com.drift.app.platform

import com.drift.app.player.PlaybackEngine
import com.drift.app.source.DeviceMediaScanner
import com.russhwolf.settings.Settings
import kotlinx.coroutines.CoroutineScope

/** Everything the shared code needs from the host platform. */
class PlatformDeps(
    val settings: Settings,
    /** Backed by Keystore (Android) / Keychain (iOS). Holds the server password. */
    val secureSettings: Settings,
    val filesDir: String,
    val scanner: DeviceMediaScanner,
    val engineFactory: (CoroutineScope) -> PlaybackEngine,
)
