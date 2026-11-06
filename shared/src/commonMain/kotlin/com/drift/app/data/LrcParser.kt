package com.drift.app.data

import com.drift.app.model.LyricLine
import com.drift.app.model.Lyrics

object LrcParser {
    private val timeTag = Regex("""\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]""")
    private val offsetTag = Regex("""^\[offset:\s*(-?\d+)]""", RegexOption.IGNORE_CASE)

    fun parse(text: String): Lyrics {
        var offset = 0L
        val timed = mutableListOf<LyricLine>()
        val plain = mutableListOf<LyricLine>()
        for (raw in text.lines()) {
            val line = raw.trimEnd()
            offsetTag.find(line)?.let { offset = it.groupValues[1].toLong(); continue }
            val tags = timeTag.findAll(line).toList()
            if (tags.isEmpty()) {
                if (line.startsWith("[") && line.contains(":") && line.endsWith("]")) continue // [ar:..] metadata
                plain += LyricLine(null, line)
                continue
            }
            val body = line.substring(tags.last().range.last + 1).trim()
            for (t in tags) {
                val min = t.groupValues[1].toLong()
                val sec = t.groupValues[2].toLong()
                val frac = t.groupValues[3]
                val ms = when (frac.length) { 0 -> 0L; 1 -> frac.toLong() * 100; 2 -> frac.toLong() * 10; else -> frac.take(3).toLong() }
                timed += LyricLine(min * 60_000 + sec * 1000 + ms + offset, body)
            }
        }
        return if (timed.isNotEmpty()) Lyrics(timed.sortedBy { it.startMs }, true) else Lyrics(plain, false)
    }

    /** Index of the line that should be highlighted at [positionMs], or -1 before the first line. */
    fun activeIndex(lines: List<LyricLine>, positionMs: Long): Int {
        var lo = 0; var hi = lines.lastIndex; var ans = -1
        while (lo <= hi) {
            val mid = (lo + hi) / 2
            if ((lines[mid].startMs ?: Long.MAX_VALUE) <= positionMs) { ans = mid; lo = mid + 1 } else hi = mid - 1
        }
        return ans
    }
}
