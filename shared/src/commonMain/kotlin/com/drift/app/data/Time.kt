package com.drift.app.data

import kotlin.time.Clock

fun nowMs(): Long = Clock.System.now().toEpochMilliseconds()
