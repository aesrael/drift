package com.drift.app.source

/** One audio file on the phone, as reported by the platform media index. */
data class DeviceAudio(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val albumId: String,
    val artistId: String,
    val durationMs: Long,
    val track: Int,
    val disc: Int,
    val year: Int,
    val genre: String?,
    /** Something the platform player can open directly (content:// on Android, ipod-library:// on iOS). */
    val uri: String,
    val dateAddedSec: Long,
    val sizeBytes: Long,
    val suffix: String?,
)

interface DeviceMediaScanner {
    fun hasPermission(): Boolean
    suspend fun requestPermission(): Boolean
    suspend fun scan(): List<DeviceAudio>
}
