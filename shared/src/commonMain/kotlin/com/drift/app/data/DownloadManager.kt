package com.drift.app.data

import com.drift.app.api.SubsonicSource
import com.drift.app.model.Song
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.HttpTimeoutConfig
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.contentLength
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.utils.io.readAvailable
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okio.FileSystem
import okio.Path
import okio.Path.Companion.toPath
import okio.buffer
import okio.use
import okio.ByteString.Companion.encodeUtf8

@Serializable
data class DownloadEntry(val song: Song, val file: String, val bytes: Long, val auto: Boolean, val at: Long)
data class DownloadProgress(val done: Long, val total: Long)

/**
 * Offline copies of server songs (device songs are already offline).
 * Only *relative* file names are stored: iOS changes the app container path between launches/updates,
 * so absolute paths in a manifest go stale.
 */
class DownloadManager(
    filesDir: String,
    private val source: SubsonicSource,
    private val scope: CoroutineScope,
) {
    private val fs = FileSystem.SYSTEM
    private val dir: Path = filesDir.toPath() / "downloads"
    private val manifest: Path = dir / "manifest.json"
    private val http = HttpClient {
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            socketTimeoutMillis = 60_000
            requestTimeoutMillis = HttpTimeoutConfig.INFINITE_TIMEOUT_MS
        }
    }

    private val _entries = MutableStateFlow<Map<String, DownloadEntry>>(emptyMap())
    val entries: StateFlow<Map<String, DownloadEntry>> = _entries.asStateFlow()
    private val _active = MutableStateFlow<Map<String, DownloadProgress>>(emptyMap())
    val active: StateFlow<Map<String, DownloadProgress>> = _active.asStateFlow()
    private val _errors = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val errors: SharedFlow<String> = _errors.asSharedFlow()

    private val queue = Channel<Pair<Song, Boolean>>(Channel.UNLIMITED)

    init {
        fs.createDirectories(dir)
        load()
        repeat(2) { scope.launch(Dispatchers.Default) { for ((song, auto) in queue) process(song, auto) } }
    }

    fun pathFor(songId: String): String? {
        val e = _entries.value[songId] ?: return null
        val p = dir / e.file
        return if (fs.exists(p)) p.toString() else null
    }

    fun isDownloaded(songId: String) = _entries.value.containsKey(songId)
    val totalBytes: Long get() = _entries.value.values.sumOf { it.bytes }

    fun enqueue(song: Song, auto: Boolean = false) {
        if (song.isLocal || _entries.value.containsKey(song.id) || _active.value.containsKey(song.id)) return
        _active.update { it + (song.id to DownloadProgress(0, song.sizeBytes)) }
        queue.trySend(song to auto)
    }

    fun enqueueAll(songs: List<Song>, auto: Boolean = false) = songs.forEach { enqueue(it, auto) }

    /** Remove a download; with [onlyAuto] a manually requested download is left alone. */
    fun remove(songId: String, onlyAuto: Boolean = false) {
        val e = _entries.value[songId] ?: return
        if (onlyAuto && !e.auto) return
        runCatching { fs.delete(dir / e.file) }
        _entries.update { it - songId }
        save()
    }

    fun removeAll() {
        _entries.value.values.forEach { runCatching { fs.delete(dir / it.file) } }
        _entries.value = emptyMap()
        save()
    }

    private suspend fun process(song: Song, auto: Boolean) {
        val name = song.id.encodeUtf8().md5().hex() + "." + (song.suffix?.filter { it.isLetterOrDigit() }?.take(5)?.ifBlank { null } ?: "audio")
        val tmp = dir / "$name.part"
        val target = dir / name
        try {
            http.prepareGet(source.downloadUrl(song)).execute { resp ->
                if (!resp.status.isSuccess()) error("HTTP ${resp.status.value}")
                val ct = resp.contentType()?.toString().orEmpty()
                if (ct.startsWith("text/") || "json" in ct || "xml" in ct) error("Server returned an error instead of audio")
                val total = resp.contentLength() ?: song.sizeBytes
                val ch = resp.bodyAsChannel()
                val buf = ByteArray(64 * 1024)
                var done = 0L
                var lastReport = 0L
                fs.sink(tmp).buffer().use { sink ->
                    while (true) {
                        val n = ch.readAvailable(buf, 0, buf.size)
                        if (n < 0) break
                        if (n == 0) continue
                        sink.write(buf, 0, n)
                        done += n
                        if (done - lastReport > 256 * 1024) {
                            lastReport = done
                            _active.update { it + (song.id to DownloadProgress(done, total)) }
                        }
                    }
                }
                if (done < 1024) error("Empty download")
                fs.atomicMove(tmp, target)
                _entries.update { it + (song.id to DownloadEntry(song, name, done, auto, nowMs())) }
                save()
            }
        } catch (e: CancellationException) {
            runCatching { fs.delete(tmp) }
            throw e
        } catch (e: Exception) {
            runCatching { fs.delete(tmp) }
            _errors.tryEmit("Couldn't download \"${song.title}\": ${e.message}")
        } finally {
            _active.update { it - song.id }
        }
    }

    private fun load() {
        _entries.value = runCatching {
            if (!fs.exists(manifest)) emptyMap()
            else Json { ignoreUnknownKeys = true }.decodeFromString<Map<String, DownloadEntry>>(fs.read(manifest) { readUtf8() })
        }.getOrDefault(emptyMap()).filterValues { fs.exists(dir / it.file) }
        // sweep leftover partial files from a previous crash
        runCatching { fs.list(dir).filter { it.name.endsWith(".part") }.forEach { fs.delete(it) } }
    }

    private fun save() {
        runCatching {
            val tmp = dir / "manifest.json.tmp"
            fs.write(tmp) { writeUtf8(Json.encodeToString(_entries.value)) }
            fs.atomicMove(tmp, manifest)
        }
    }
}
