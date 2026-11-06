package com.drift.app

import com.drift.app.data.LrcParser
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LrcParserTest {
    @Test fun parsesTimedLinesAndOffset() {
        val l = LrcParser.parse("[ar:Someone]\n[offset:100]\n[00:01.50]Hello\n[00:03.00][00:10.00]Again\n")
        assertTrue(l.synced)
        assertEquals(listOf(1600L, 3100L, 10100L), l.lines.map { it.startMs })
        assertEquals("Again", l.lines.last().text)
    }

    @Test fun plainTextIsNotSynced() {
        val l = LrcParser.parse("line one\nline two")
        assertFalse(l.synced)
        assertEquals(2, l.lines.size)
    }

    @Test fun activeIndexFollowsPosition() {
        val l = LrcParser.parse("[00:01.00]a\n[00:02.00]b\n[00:03.00]c")
        assertEquals(-1, LrcParser.activeIndex(l.lines, 500))
        assertEquals(1, LrcParser.activeIndex(l.lines, 2500))
        assertEquals(2, LrcParser.activeIndex(l.lines, 99_000))
    }
}
