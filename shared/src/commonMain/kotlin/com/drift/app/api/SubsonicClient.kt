package com.drift.app.api

import com.drift.app.model.SubsonicException
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.URLBuilder
import io.ktor.http.isSuccess
import kotlinx.serialization.json.*
import okio.ByteString.Companion.encodeUtf8
import kotlin.coroutines.cancellation.CancellationException
import kotlin.random.Random

data class ServerConfig(val url: String, val username: String, val password: String)

const val API_VERSION = "1.16.1"
const val CLIENT_NAME = "Drift"

/**
 * Transport + authentication only. Standard Subsonic token auth (t = md5(password + salt), s = salt).
 * The salt is random but constant for the process so that cover-art/stream URLs stay stable
 * (important for image caching). If the server rejects token auth (codes 41–43, e.g. LDAP users)
 * we fall back to hex-encoded password auth (`p=enc:...`) for the rest of the session.
 */
class SubsonicClient(private val config: () -> ServerConfig?) {
    private val http = HttpClient {
        install(HttpTimeout) {
            connectTimeoutMillis = 10_000
            requestTimeoutMillis = 30_000
            socketTimeoutMillis = 30_000
        }
        expectSuccess = false
    }
    private val salt = randomSalt()
    private var legacyAuth = false

    val isConfigured get() = config() != null

    private fun authParams(cfg: ServerConfig): List<Pair<String, String>> = buildList {
        add("u" to cfg.username)
        if (legacyAuth) {
            add("p" to "enc:" + cfg.password.encodeUtf8().hex())
        } else {
            add("t" to (cfg.password + salt).encodeUtf8().md5().hex())
            add("s" to salt)
        }
        add("v" to API_VERSION)
        add("c" to CLIENT_NAME)
    }

    /** Builds a full URL (used directly for stream / download / getCoverArt, and internally for JSON calls). */
    fun url(method: String, params: List<Pair<String, String>> = emptyList(), json: Boolean = false): String {
        val cfg = config() ?: throw SubsonicException(SubsonicException.NOT_SIGNED_IN, "Not signed in")
        val b = URLBuilder(cfg.url.trimEnd('/') + "/rest/$method.view")
        (authParams(cfg) + params + if (json) listOf("f" to "json") else emptyList())
            .forEach { (k, v) -> b.parameters.append(k, v) }
        return b.buildString()
    }

    suspend fun call(method: String, params: List<Pair<String, String>> = emptyList()): JsonObject =
        try {
            execute(method, params)
        } catch (e: SubsonicException) {
            if (!legacyAuth && e.code in 41..43) {
                legacyAuth = true
                execute(method, params)
            } else throw e
        }

    private suspend fun execute(method: String, params: List<Pair<String, String>>): JsonObject {
        val resp = try {
            http.get(url(method, params, json = true))
        } catch (e: CancellationException) {
            throw e
        } catch (e: SubsonicException) {
            throw e
        } catch (e: Exception) {
            throw SubsonicException(SubsonicException.NETWORK, "Can't reach the server (${e.message ?: "network error"})")
        }
        if (!resp.status.isSuccess()) throw SubsonicException(resp.status.value, "Server returned HTTP ${resp.status.value}")
        val root = try {
            SubsonicJson.parseToJsonElement(resp.bodyAsText()).jsonObject["subsonic-response"]?.jsonObject
        } catch (e: Exception) {
            null
        } ?: throw SubsonicException(SubsonicException.NOT_SUBSONIC, "That doesn't look like a Subsonic server")
        if (root["status"]?.jsonPrimitive?.contentOrNull != "ok") {
            val err = root["error"]?.jsonObject
            val code = err?.get("code")?.jsonPrimitive?.intOrNull ?: 0
            val msg = err?.get("message")?.jsonPrimitive?.contentOrNull ?: "Unknown error"
            throw SubsonicException(code, if (code == 40) "Wrong username or password" else msg)
        }
        return root
    }

    companion object {
        private fun randomSalt(): String {
            val chars = "abcdef0123456789"
            return buildString { repeat(12) { append(chars[Random.nextInt(chars.length)]) } }
        }
    }
}
