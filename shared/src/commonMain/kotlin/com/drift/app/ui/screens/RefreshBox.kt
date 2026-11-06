package com.drift.app.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

/**
 * Fallback for androidx.compose.material3.pulltorefresh.PullToRefreshBox,
 * which does not resolve for Kotlin Multiplatform. Same call signature so
 * screens compile unchanged; shows a progress bar while refreshing but
 * offers no pull gesture. Upstream can delete this file once the real
 * artifact is available.
 */
@Composable
fun PullToRefreshBox(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Box(modifier) {
        content()
        if (isRefreshing) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
    }
}
