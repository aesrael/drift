package com.drift.app

import com.drift.app.api.ServerConfig
import com.drift.app.api.SubsonicClient
import okio.ByteString.Companion.encodeUtf8
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SubsonicAuthTest {
    @Test fun tokenMatchesSubsonicSpecExample() {
        // From the Subsonic API docs: password "sesame", salt "c19b2d" → 26719a1196d2a940705a59634eb18eab
        assertEquals("26719a1196d2a940705a59634eb18eab", ("sesame" + "c19b2d").encodeUtf8().md5().hex())
    }

    @Test fun urlsCarryStandardParamsAndNeverThePlainPassword() {
        val c = SubsonicClient { ServerConfig("https://example.com/navidrome/", "alice", "hunter2") }
        val u = c.url("stream", listOf("id" to "42"))
        assertTrue(u.startsWith("https://example.com/navidrome/rest/stream.view?"))
        for (p in listOf("u=alice", "t=", "s=", "v=1.16.1", "c=Drift", "id=42")) assertTrue(p in u, "missing $p in $u")
        assertTrue("hunter2" !in u)
    }

    @Test fun urlsAreStableWithinASession() {
        val c = SubsonicClient { ServerConfig("https://x.test", "a", "b") }
        assertEquals(c.url("getCoverArt", listOf("id" to "1")), c.url("getCoverArt", listOf("id" to "1")))
    }
}
