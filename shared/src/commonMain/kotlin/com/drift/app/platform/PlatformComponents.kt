package com.drift.app.platform

import coil3.ComponentRegistry
import coil3.PlatformContext

/** Registers platform-only image sources (device album art via devicecover://). */
expect fun ComponentRegistry.Builder.addPlatformComponents(context: PlatformContext)
