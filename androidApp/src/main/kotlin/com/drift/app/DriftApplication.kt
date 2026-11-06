package com.drift.app

import android.app.Application
import com.drift.app.di.AppGraph
import com.drift.app.platform.androidPlatformDeps

class DriftApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Runs for every process start, including when Android Auto binds the playback service
        // before any Activity exists, so the service always has a fully built graph.
        AppGraph.init(androidPlatformDeps(this))
    }
}
