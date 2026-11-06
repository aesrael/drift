package com.drift.app

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import com.drift.app.di.AppGraph
import com.drift.app.platform.PermissionBridge
import com.drift.app.platform.hasPermission
import com.drift.app.ui.DriftApp
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { PermissionBridge.onResult(it) }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        PermissionBridge.attach { permissionLauncher.launch(it) }
        setContent { DriftApp() }

        // Android 13+: without this the playback notification (and lock-screen controls) are hidden.
        if (Build.VERSION.SDK_INT >= 33 && !hasPermission(application, Manifest.permission.POST_NOTIFICATIONS)) {
            AppGraph.scope.launch { PermissionBridge.request(Manifest.permission.POST_NOTIFICATIONS) }
        }
    }

    override fun onDestroy() {
        PermissionBridge.detach()
        super.onDestroy()
    }
}
