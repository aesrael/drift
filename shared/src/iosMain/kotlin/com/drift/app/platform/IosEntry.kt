package com.drift.app.platform

import androidx.compose.ui.window.ComposeUIViewController
import com.drift.app.di.AppGraph
import com.drift.app.player.IosPlaybackEngine
import com.drift.app.ui.DriftApp
import com.russhwolf.settings.KeychainSettings
import com.russhwolf.settings.NSUserDefaultsSettings
import platform.Foundation.*
import platform.UIKit.UIViewController

private fun supportDir(): String {
    val dir = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, true).first() as String
    NSFileManager.defaultManager.createDirectoryAtPath(dir, withIntermediateDirectories = true, attributes = null, error = null)
    return dir
}

/** Call once from Swift (App.init) before the first view is created. */
fun startDrift() {
    AppGraph.init(
        PlatformDeps(
            settings = NSUserDefaultsSettings(NSUserDefaults.standardUserDefaults),
            secureSettings = KeychainSettings(service = "com.drift.app"),
            filesDir = supportDir(),
            scanner = IosDeviceMediaScanner(),
            engineFactory = { scope -> IosPlaybackEngine(scope) },
        ),
    )
}

fun MainViewController(): UIViewController = ComposeUIViewController { DriftApp() }
