package com.drift.app.player

import com.drift.app.data.AppPrefs
import com.drift.app.data.nowMs
import com.drift.app.source.SourceRouter
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/**
 * Standard scrobbling rules:
 *  - "now playing" (submission=false) when a track starts,
 *  - one submission (submission=true, with the start time) once the track is longer than 30 s and
 *    has played for half its length or 4 minutes, whichever comes first.
 * Failed submissions are retried when the next call succeeds.
 */
class Scrobbler(
    private val engine: PlaybackEngine,
    private val router: SourceRouter,
    private val prefs: AppPrefs,
    private val scope: CoroutineScope,
) {
    private var currentId: String? = null
    private var startedAt = 0L
    private var submitted = false
    private val pending = ArrayDeque<Triple<String, Long, Boolean>>()

    fun start() {
        scope.launch {
            engine.state.map { it.current?.id to it.isPlaying }.distinctUntilChanged().collect { (id, playing) ->
                if (id != null && playing && id != currentId) {
                    currentId = id; startedAt = nowMs(); submitted = false
                    send(id, startedAt, false)
                } else if (id == null) currentId = null
            }
        }
        scope.launch {
            engine.position.collect { pos ->
                val id = currentId ?: return@collect
                if (submitted || pos.durationMs < 30_000) return@collect
                if (pos.positionMs >= minOf(pos.durationMs / 2, 240_000)) {
                    submitted = true
                    send(id, startedAt, true)
                }
            }
        }
    }

    private fun send(id: String, time: Long, submission: Boolean) {
        if (!prefs.scrobble.value) return
        scope.launch(Dispatchers.Default) {
            try {
                router.scrobble(id, time, submission)
                while (pending.isNotEmpty()) {
                    val (pid, pt, ps) = pending.first()
                    router.scrobble(pid, pt, ps)
                    pending.removeFirst()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (submission) { pending.addLast(Triple(id, time, true)); while (pending.size > 50) pending.removeFirst() }
            }
        }
    }
}
