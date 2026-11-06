package com.drift.app.platform

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.drift.app.player.AndroidPlaybackEngine
import com.russhwolf.settings.SharedPreferencesSettings
import com.russhwolf.settings.Settings
import kotlinx.coroutines.CompletableDeferred

object AndroidContext { lateinit var app: Application }

/** Lets shared code ask for runtime permissions through the Activity that is currently on screen. */
object PermissionBridge {
    private var launcher: ((String) -> Unit)? = null
    private var pending: CompletableDeferred<Boolean>? = null
    fun attach(l: (String) -> Unit) { launcher = l }
    fun detach() { launcher = null }
    fun onResult(granted: Boolean) { pending?.complete(granted); pending = null }
    suspend fun request(permission: String): Boolean {
        val l = launcher ?: return false
        pending?.complete(false)
        val d = CompletableDeferred<Boolean>()
        pending = d
        l(permission)
        return d.await()
    }
}

fun androidAudioPermission() =
    if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE

fun hasPermission(app: Application, permission: String) =
    ContextCompat.checkSelfPermission(app, permission) == PackageManager.PERMISSION_GRANTED

private fun secureSettings(app: Application): Settings {
    val key = MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    val prefs = try {
        EncryptedSharedPreferences.create(app, "drift_secure", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    } catch (e: Exception) {
        // Keystore corruption (restore from backup on another device etc.): start clean instead of crashing.
        app.deleteSharedPreferences("drift_secure")
        EncryptedSharedPreferences.create(app, "drift_secure", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }
    return SharedPreferencesSettings(prefs)
}

fun androidPlatformDeps(app: Application): PlatformDeps {
    AndroidContext.app = app
    return PlatformDeps(
        settings = SharedPreferencesSettings(app.getSharedPreferences("drift", android.content.Context.MODE_PRIVATE)),
        secureSettings = secureSettings(app),
        filesDir = app.filesDir.absolutePath,
        scanner = AndroidDeviceMediaScanner(app),
        engineFactory = { scope -> AndroidPlaybackEngine(app, scope) },
    )
}
