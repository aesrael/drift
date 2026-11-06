package com.drift.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drift.app.api.ServerConfig
import com.drift.app.api.SubsonicClient
import com.drift.app.api.SubsonicSource
import com.drift.app.data.SourceMode
import com.drift.app.di.AppGraph
import com.drift.app.ui.*
import kotlinx.coroutines.launch

/** screens/WelcomeScreen.tsx */
@Composable
fun WelcomeScreen() {
    val g = AppGraph
    val c = Drift.colors
    val scope = rememberCoroutineScope()
    val saved = g.prefs.config.value
    var url by remember { mutableStateOf(saved?.url ?: "") }
    var user by remember { mutableStateOf(saved?.username ?: "") }
    var pass by remember { mutableStateOf(saved?.password ?: "") }
    var loading by remember { mutableStateOf(false) }
    var alert by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().background(c.background).systemBarsPaddingCompat().verticalScroll(rememberScrollState()).padding(Spacing.xl), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("♪", fontSize = 64.sp, color = c.text, textAlign = TextAlign.Center, modifier = Modifier.padding(bottom = Spacing.md))
        Text("Drift", fontSize = Fonts.xxxl, fontWeight = FontWeight.Bold, color = c.primary, textAlign = TextAlign.Center)
        Spacer(Modifier.height(Spacing.xs))
        Text("Connect to your music server", fontSize = Fonts.md, color = c.textSecondary, textAlign = TextAlign.Center)
        Spacer(Modifier.height(Spacing.xl))

        Field("Server URL", url, "https://music.example.com", { url = it }, KeyboardType.Uri)
        Field("Username", user, "Username", { user = it }, KeyboardType.Text)
        Field("Password", pass, "Password", { pass = it }, KeyboardType.Password, password = true)

        Box(Modifier.padding(top = Spacing.md).fillMaxWidth().alpha(if (loading) .6f else 1f).clip(RoundedCornerShape(12.dp)).background(c.primary).tap {
            if (loading) return@tap
            val trimmed = url.trim()
            val withScheme = if (trimmed.startsWith("http://", true) || trimmed.startsWith("https://", true)) trimmed else "http://$trimmed"
            val normalized = withScheme.trimEnd('/')
            if (trimmed.isEmpty() || user.isEmpty() || pass.isEmpty()) { alert = "Please fill in all fields"; return@tap }
            loading = true
            scope.launch {
                val cfg = ServerConfig(normalized, user.trim(), pass)
                try {
                    SubsonicSource(SubsonicClient { cfg }) { 0 }.ping()
                    g.prefs.saveServer(cfg); g.prefs.setMode(SourceMode.Server)
                } catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e } catch (e: Exception) {
                    alert = "Failed to connect. ${friendlyError(e)}"
                }
                loading = false
            }
        }.padding(Spacing.md), contentAlignment = Alignment.Center) {
            Text(if (loading) "Connecting..." else "Connect", color = Color.White, fontSize = Fonts.lg, fontWeight = FontWeight.SemiBold)
        }
        Box(Modifier.padding(top = Spacing.sm).fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, c.primary, RoundedCornerShape(12.dp)).tap {
            if (loading) return@tap
            scope.launch {
                if (g.local.requestPermission()) g.prefs.setMode(SourceMode.DeviceOnly)
                else alert = "Could not enter local mode. Drift needs permission to read music on this device."
            }
        }.padding(Spacing.md), contentAlignment = Alignment.Center) {
            Text("Play files on this device", color = c.primary, fontSize = Fonts.md, fontWeight = FontWeight.SemiBold)
        }
    }
    alert?.let { AlertDialog(onDismissRequest = { alert = null }, title = { Text("Error") }, text = { Text(it) }, confirmButton = { TextButton(onClick = { alert = null }) { Text("OK") } }) }
}

@Composable
private fun Field(label: String, value: String, placeholder: String, onChange: (String) -> Unit, keyboard: KeyboardType, password: Boolean = false) {
    val c = Drift.colors
    Column(Modifier.fillMaxWidth().padding(bottom = Spacing.md)) {
        Text(label, color = c.text, fontSize = Fonts.sm, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = Spacing.xs))
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface).border(1.dp, c.border, RoundedCornerShape(12.dp)).padding(Spacing.md)) {
            if (value.isEmpty()) Text(placeholder, color = c.textMuted, fontSize = Fonts.md)
            BasicTextField(value, onChange, singleLine = true, textStyle = TextStyle(color = c.text, fontSize = Fonts.md), cursorBrush = SolidColor(c.primary),
                visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
                keyboardOptions = KeyboardOptions(keyboardType = keyboard, capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false), modifier = Modifier.fillMaxWidth())
        }
    }
}
