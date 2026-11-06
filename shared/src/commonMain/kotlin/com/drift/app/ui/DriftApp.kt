package com.drift.app.ui

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.LibraryMusic
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.disk.DiskCache
import coil3.network.ktor3.KtorNetworkFetcherFactory
import coil3.request.crossfade
import com.drift.app.data.PlaybackDebug
import com.drift.app.di.AppGraph
import com.drift.app.platform.addPlatformComponents
import com.drift.app.ui.screens.*
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import okio.FileSystem

@Composable
fun DriftApp() {
    val g = AppGraph
    setSingletonImageLoaderFactory { ctx ->
        ImageLoader.Builder(ctx)
            .components { add(KtorNetworkFetcherFactory()); addPlatformComponents(ctx) }
            .diskCache { DiskCache.Builder().directory(FileSystem.SYSTEM_TEMPORARY_DIRECTORY.resolve("drift_images")).maxSizeBytes(300L * 1024 * 1024).build() }
            .crossfade(false)
            .build()
    }
    val theme by g.prefs.theme.collectAsState()
    val mode by g.prefs.mode.collectAsState()
    DriftTheme(theme) {
        Box(Modifier.fillMaxSize().background(Drift.colors.background)) {
            if (mode == null) WelcomeScreen() else MainShell()
        }
    }
}

private enum class Tab(val label: String, val icon: ImageVector, val route: Any) {
    Play("Play", Icons.Outlined.PlayCircle, HomeRoute),
    Library("Library", Icons.Outlined.LibraryMusic, LibraryRoute),
    Downloads("Downloads", Icons.Outlined.Download, DownloadsRoute),
}

@Composable
private fun MainShell() {
    val g = AppGraph
    val c = Drift.colors
    val nav = rememberNavController()
    val snack = remember { SnackbarHostState() }
    val backEntry by nav.currentBackStackEntryAsState()
    val dest = backEntry?.destination
    var tab by remember { mutableStateOf(Tab.Play) }
    val nowPlayingActive = dest?.hasRoute(NowPlayingRoute::class) == true
    val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val tabs = Tab.entries

    LaunchedEffect(Unit) { g.actions.messages.collect { snack.showSnackbar(it) } }
    LaunchedEffect(Unit) { g.downloads.errors.collect { snack.showSnackbar(it) } }
    LaunchedEffect(Unit) {
        g.player.state.map { Triple(it.index, it.isPlaying, it.isBuffering) to it.current?.id }.distinctUntilChanged()
            .collect { (s, id) -> PlaybackDebug.push("state idx=${s.first} playing=${s.second} buffering=${s.third} id=${id ?: ""}") }
    }
    LaunchedEffect(dest) {
        when {
            dest?.hasRoute(HomeRoute::class) == true -> tab = Tab.Play
            dest?.hasRoute(LibraryRoute::class) == true -> tab = Tab.Library
            dest?.hasRoute(DownloadsRoute::class) == true -> tab = Tab.Downloads
        }
    }

    CompositionLocalProvider(LocalNav provides nav) {
        Box(Modifier.fillMaxSize().background(c.background)) {
            Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f).fillMaxWidth().windowInsetsPadding(WindowInsets.systemBars.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))) {
                    NavHost(nav, startDestination = HomeRoute) {
                        composable<HomeRoute> { HomeScreen() }
                        composable<LibraryRoute> { LibraryScreen() }
                        composable<DownloadsRoute> { DownloadsScreen() }
                        slideRight<SearchRoute> { SearchScreen() }
                        slideRight<SettingsRoute> { SettingsScreen() }
                        slideRight<CollectionRoute> { val r = it.toRoute<CollectionRoute>(); CollectionScreen(r.type, r.id, r.name, r.coverArt) }
                        slideRight<SeeAllRoute> { SeeAllScreen(it.toRoute<SeeAllRoute>()) }
                        composable<NowPlayingRoute>(
                            enterTransition = { slideInVertically { it } }, exitTransition = { fadeOut() },
                            popEnterTransition = { fadeIn() }, popExitTransition = { slideOutVertically { it } },
                        ) { NowPlayingScreen() }
                    }
                }
                TabBar(tabs, tab, navInset) { t ->
                    tab = t
                    // Play always lands on the Home root; other tabs keep save/restore state.
                    if (t == Tab.Play) nav.popBackStack(HomeRoute, inclusive = false)
                    else nav.navigate(t.route) { popUpTo(HomeRoute) { saveState = true }; launchSingleTop = true; restoreState = true }
                }
            }
            if (!nowPlayingActive) MiniPlayer(Modifier.align(Alignment.BottomCenter).padding(bottom = 64.dp + navInset, start = 12.dp, end = 12.dp)) { nav.navigate(NowPlayingRoute) }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = 130.dp + navInset))
        }
    }
}

private inline fun <reified T : Any> NavGraphBuilder.slideRight(noinline content: @Composable AnimatedContentScope.(androidx.navigation.NavBackStackEntry) -> Unit) =
    composable<T>(
        enterTransition = { slideInHorizontally { it } }, exitTransition = { slideOutHorizontally { -it / 4 } },
        popEnterTransition = { slideInHorizontally { -it / 4 } }, popExitTransition = { slideOutHorizontally { it } },
        content = content,
    )

/** Bottom tab bar from App.tsx: height 60 + inset, 1dp top border, paddingTop 8, active = primary, inactive = textMuted. */
@Composable
private fun TabBar(tabs: List<Tab>, selected: Tab, inset: androidx.compose.ui.unit.Dp, onSelect: (Tab) -> Unit) {
    val c = Drift.colors
    Row(Modifier.fillMaxWidth().background(c.background).drawBehind { drawLine(c.border, androidx.compose.ui.geometry.Offset(0f, 0f), androidx.compose.ui.geometry.Offset(size.width, 0f), 1.dp.toPx()) }.height(60.dp + inset).padding(top = 8.dp, bottom = maxOf(8.dp, inset))) {
        tabs.forEach { t ->
            val col = if (t == selected) c.primary else c.textMuted
            Column(Modifier.weight(1f).fillMaxHeight().tap { onSelect(t) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Icon(t.icon, t.label, Modifier.size(24.dp), tint = col)
                Text(t.label, color = col, fontSize = 10.sp)
            }
        }
    }
}
