package com.drift.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.drift.app.data.PlaybackDebug
import com.drift.app.data.SourceMode
import com.drift.app.data.ThemeMode
import com.drift.app.di.AppGraph
import com.drift.app.ui.*
import kotlinx.coroutines.launch

/** screens/SettingsScreen.tsx (+ the requested "also show music on this device" switch). */
@Composable
fun SettingsScreen() {
    val g = AppGraph
    val c = Drift.colors
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val theme by g.prefs.theme.collectAsState()
    val mode by g.prefs.mode.collectAsState()
    val cfg by g.prefs.config.collectAsState()
    val showDevice by g.prefs.showDeviceMusic.collectAsState()
    val deviceOnly = mode == SourceMode.DeviceOnly
    var taps by remember { mutableIntStateOf(0) }
    var diagnostics by remember { mutableStateOf(false) }
    var copied by remember { mutableIntStateOf(0) }
    var confirm by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current

    Column(Modifier.fillMaxSize().background(c.surface).verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            BackButton { nav.popBackStack() }
            Text("Settings", color = c.text, fontSize = Fonts.lg, fontWeight = FontWeight.Bold)
            Spacer(Modifier.size(36.dp))
        }
        Column(Modifier.padding(Spacing.md)) {
            Section("Account") {
                Row(Modifier.fillMaxWidth().padding(Spacing.md), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Appearance", color = c.text, fontSize = Fonts.md)
                    Row(Modifier.clip(RoundedCornerShape(8.dp)).background(c.border).padding(2.dp)) {
                        listOf("Light" to ThemeMode.Light, "Dark" to ThemeMode.Dark, "Auto" to ThemeMode.System).forEach { (label, m) ->
                            Box(Modifier.widthIn(min = 52.dp).clip(RoundedCornerShape(6.dp)).background(if (theme == m) c.background else Color.Transparent).tap { g.prefs.setTheme(m) }.padding(horizontal = Spacing.sm, vertical = 6.dp), contentAlignment = Alignment.Center) {
                                Text(label, color = if (theme == m) c.text else c.textMuted, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                Divider()
                ValueRow("Server", if (deviceOnly) "On this device" else cfg?.url ?: "—")
                Divider()
                ValueRow("Username", if (deviceOnly) "—" else cfg?.username ?: "—")
                if (!deviceOnly) {
                    Divider()
                    Row(Modifier.fillMaxWidth().padding(Spacing.md), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Also show music on this device", color = c.text, fontSize = Fonts.md, modifier = Modifier.weight(1f))
                        Switch(showDevice, { on ->
                            if (!on) g.prefs.setShowDeviceMusic(false)
                            else scope.launch { if (g.local.requestPermission()) g.prefs.setShowDeviceMusic(true) else g.actions.message("Drift needs permission to read music on this device") }
                        }, colors = SwitchDefaults.colors(checkedTrackColor = c.primary))
                    }
                }
            }
            Section("About") {
                Row(Modifier.fillMaxWidth().tap { taps++; if (taps >= 5) { taps = 0; diagnostics = !diagnostics } }.padding(Spacing.md), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("App Version", color = c.text, fontSize = Fonts.md); Text("1.0.0", color = c.textSecondary, fontSize = Fonts.md)
                }
                Divider()
                ValueRow("API Version", "Subsonic 1.16.1")
            }
            if (diagnostics) Section("Playback events") {
                Column(Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs)) {
                    PlaybackDebug.lines().takeLast(8).forEach { Text(it, color = c.textSecondary, fontSize = Fonts.xs, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(vertical = 2.dp), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                }
                Row(Modifier.fillMaxWidth().tap { clipboard.setText(AnnotatedString(PlaybackDebug.lines().joinToString("\n"))); copied++ }.padding(vertical = Spacing.sm), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.ContentCopy, null, Modifier.size(16.dp), tint = c.text)
                    Text(if (copied > 0) "Copied" else "Copy events", color = c.text, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = Spacing.xs))
                }
            }
            Box(Modifier.padding(top = Spacing.xl).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.error).tap { if (deviceOnly) g.signOut() else confirm = true }.padding(Spacing.md), contentAlignment = Alignment.Center) {
                Text(if (deviceOnly) "Connect to server" else "Disconnect", color = Color.White, fontSize = Fonts.md, fontWeight = FontWeight.SemiBold)
            }
        }
    }
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false }, title = { Text("Logout") }, text = { Text("Are you sure you want to disconnect?") },
        confirmButton = { TextButton(onClick = { confirm = false; g.signOut() }) { Text("Disconnect", color = c.error) } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel") } },
    )
}

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    val c = Drift.colors
    Column(Modifier.padding(bottom = Spacing.lg)) {
        Text(title.uppercase(), color = c.textSecondary, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = Spacing.xs, bottom = Spacing.sm))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.background), content = content)
    }
}

@Composable private fun Divider() = Box(Modifier.padding(horizontal = Spacing.md).fillMaxWidth().height(1.dp).background(Drift.colors.border))

@Composable
private fun ValueRow(label: String, value: String) {
    val c = Drift.colors
    Row(Modifier.fillMaxWidth().padding(Spacing.md), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = c.text, fontSize = Fonts.md)
        Text(value, color = c.textSecondary, fontSize = Fonts.md, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = Spacing.md))
    }
}
