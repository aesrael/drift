package com.drift.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drift.app.data.ThemeMode

/** Ported 1:1 from src/constants/theme.ts (LIGHT_COLORS / DARK_COLORS). */
@Immutable
class DriftColors(
    val primary: Color, val primaryDark: Color, val background: Color, val surface: Color, val surfaceLight: Color,
    val text: Color, val textSecondary: Color, val textMuted: Color, val border: Color, val error: Color,
    val success: Color, val tertiary: Color, val tertiaryLight: Color, val glass: Color, val glassBorder: Color, val overlay: Color,
)

val LightColors = DriftColors(
    primary = Color(0xFFE2211C), primaryDark = Color(0xFFB81813), background = Color(0xFFFFFFFF), surface = Color(0xFFF5F5F5),
    surfaceLight = Color(0xFFFAFAFA), text = Color(0xFF1A1A1A), textSecondary = Color(0xFF666666), textMuted = Color(0xFF999999),
    border = Color(0xFFE0E0E0), error = Color(0xFFD32F2F), success = Color(0xFF388E3C), tertiary = Color(0xFF8B5CF6),
    tertiaryLight = Color(0xFFA78BFA), glass = Color.White.copy(alpha = .8f), glassBorder = Color.Black.copy(alpha = .05f),
    overlay = Color.Black.copy(alpha = .1f),
)
val DarkColors = DriftColors(
    primary = Color(0xFFE2211C), primaryDark = Color(0xFFB81813), background = Color(0xFF010101), surface = Color(0xFF0F1115),
    surfaceLight = Color(0xFF161920), text = Color(0xFFF5F5F5), textSecondary = Color(0xFFC7C9D1), textMuted = Color(0xFF8C909B),
    border = Color(0xFF1F2229), error = Color(0xFFFF6B6B), success = Color(0xFF5DD26F), tertiary = Color(0xFFA78BFA),
    tertiaryLight = Color(0xFFC4B5FD), glass = Color.White.copy(alpha = .05f), glassBorder = Color.White.copy(alpha = .08f),
    overlay = Color.Black.copy(alpha = .3f),
)

object Spacing { val xs = 4.dp; val sm = 8.dp; val md = 16.dp; val lg = 24.dp; val xl = 32.dp }
object Fonts { val xs = 12.sp; val sm = 14.sp; val md = 16.sp; val lg = 18.sp; val xl = 20.sp; val xxl = 24.sp; val xxxl = 32.sp }

val LocalDriftColors = staticCompositionLocalOf { LightColors }
val LocalIsDark = staticCompositionLocalOf { false }

/** `Drift.colors` / `Drift.isDark` — the Compose equivalent of useTheme(). */
object Drift {
    val colors: DriftColors @Composable get() = LocalDriftColors.current
    val isDark: Boolean @Composable get() = LocalIsDark.current
}

@Composable
fun DriftTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) { ThemeMode.System -> isSystemInDarkTheme(); ThemeMode.Dark -> true; ThemeMode.Light -> false }
    val c = if (dark) DarkColors else LightColors
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = c.primary, onPrimary = Color.White, background = c.background, onBackground = c.text,
        surface = c.background, onSurface = c.text, surfaceVariant = c.surface, onSurfaceVariant = c.textSecondary,
        outline = c.border, error = c.error, surfaceContainer = c.background, surfaceContainerHigh = c.background,
    )
    CompositionLocalProvider(LocalDriftColors provides c, LocalIsDark provides dark) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
