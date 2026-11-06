package com.drift.app.data

import com.drift.app.api.ServerConfig
import com.russhwolf.settings.Settings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class SourceMode { Server, DeviceOnly }
enum class ThemeMode { System, Light, Dark }

/**
 * Non-secret prefs live in [plain]; the password lives only in [secure]
 * (EncryptedSharedPreferences on Android, Keychain on iOS).
 */
class AppPrefs(private val plain: Settings, private val secure: Settings) {

    private val _mode = MutableStateFlow(plain.getStringOrNull("mode")?.let { runCatching { SourceMode.valueOf(it) }.getOrNull() })
    /** null = onboarding not completed. */
    val mode: StateFlow<SourceMode?> = _mode.asStateFlow()

    private val _showDeviceMusic = MutableStateFlow(plain.getBoolean("showDeviceMusic", false))
    val showDeviceMusic: StateFlow<Boolean> = _showDeviceMusic.asStateFlow()

    private val _theme = MutableStateFlow(plain.getStringOrNull("theme")?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.System)
    val theme: StateFlow<ThemeMode> = _theme.asStateFlow()

    private val _downloadStarred = MutableStateFlow(plain.getBoolean("downloadStarred", true))
    val downloadStarred: StateFlow<Boolean> = _downloadStarred.asStateFlow()

    private val _scrobble = MutableStateFlow(plain.getBoolean("scrobble", true))
    val scrobble: StateFlow<Boolean> = _scrobble.asStateFlow()

    /** 0 = original / server default. */
    private val _maxBitRate = MutableStateFlow(plain.getInt("maxBitRate", 0))
    val maxBitRate: StateFlow<Int> = _maxBitRate.asStateFlow()

    private val _config = MutableStateFlow(loadConfig())
    val config: StateFlow<ServerConfig?> = _config.asStateFlow()

    private fun loadConfig(): ServerConfig? {
        val url = plain.getStringOrNull("serverUrl") ?: return null
        val user = plain.getStringOrNull("username") ?: return null
        val pass = secure.getStringOrNull("password") ?: return null
        return ServerConfig(url, user, pass)
    }

    fun setMode(m: SourceMode?) {
        if (m == null) plain.remove("mode") else plain.putString("mode", m.name)
        _mode.value = m
    }

    fun saveServer(cfg: ServerConfig) {
        plain.putString("serverUrl", cfg.url)
        plain.putString("username", cfg.username)
        secure.putString("password", cfg.password)
        _config.value = cfg
    }

    fun clearServer() {
        plain.remove("serverUrl"); plain.remove("username"); secure.remove("password")
        _config.value = null
    }

    fun setShowDeviceMusic(v: Boolean) { plain.putBoolean("showDeviceMusic", v); _showDeviceMusic.value = v }
    fun setTheme(v: ThemeMode) { plain.putString("theme", v.name); _theme.value = v }
    fun setDownloadStarred(v: Boolean) { plain.putBoolean("downloadStarred", v); _downloadStarred.value = v }
    fun setScrobble(v: Boolean) { plain.putBoolean("scrobble", v); _scrobble.value = v }
    fun setMaxBitRate(v: Int) { plain.putInt("maxBitRate", v); _maxBitRate.value = v }

    var sessionJson: String?
        get() = plain.getStringOrNull("session")
        set(v) { if (v == null) plain.remove("session") else plain.putString("session", v) }

    var recentSearches: List<String>
        get() = plain.getStringOrNull("recentSearches")?.split('\n')?.filter { it.isNotBlank() } ?: emptyList()
        set(v) { plain.putString("recentSearches", v.take(10).joinToString("\n")) }

    companion object {
        fun normalizeUrl(raw: String): String {
            val t = raw.trim().trimEnd('/')
            return if (t.startsWith("http://", true) || t.startsWith("https://", true)) t else "https://$t"
        }
    }
}
