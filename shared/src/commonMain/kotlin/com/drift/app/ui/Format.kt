package com.drift.app.ui

fun formatTime(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
}

fun formatDuration(sec: Int) = formatTime(sec * 1000L)

fun formatTotal(sec: Int): String {
    val h = sec / 3600; val m = (sec % 3600) / 60
    return if (h > 0) "$h hr $m min" else "$m min"
}

fun formatBytes(b: Long): String = when {
    b >= 1L shl 30 -> "${(b * 10 / (1L shl 30)) / 10.0} GB"
    b >= 1L shl 20 -> "${(b * 10 / (1L shl 20)) / 10.0} MB"
    b >= 1L shl 10 -> "${b / 1024} KB"
    else -> "$b B"
}

fun friendlyError(t: Throwable): String = t.message?.takeIf { it.isNotBlank() } ?: "Something went wrong"
