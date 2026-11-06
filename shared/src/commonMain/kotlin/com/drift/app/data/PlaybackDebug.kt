package com.drift.app.data

/** Ring buffer of recent player events, shown under Settings → (tap App Version 5×). Ported from playbackService.ts. */
object PlaybackDebug {
    private val trail = ArrayDeque<String>()
    fun push(line: String) { trail.addLast("${formatClock(nowMs())} $line"); while (trail.size > 30) trail.removeFirst() }
    fun lines(): List<String> = trail.toList()

    private fun formatClock(ms: Long): String {
        val s = (ms / 1000) % 86400
        return "${(s / 3600).toString().padStart(2, '0')}:${((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}.${(ms % 1000).toString().padStart(3, '0')}"
    }
}
