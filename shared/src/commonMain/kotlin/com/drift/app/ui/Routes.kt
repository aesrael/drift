package com.drift.app.ui

import kotlinx.serialization.Serializable

@Serializable object HomeRoute
@Serializable object LibraryRoute
@Serializable object DownloadsRoute
@Serializable object SearchRoute
@Serializable object SettingsRoute
@Serializable object NowPlayingRoute

/** Original: CollectionDetails { type: 'album' | 'playlist' | 'genre', id, name, coverArt }. */
@Serializable data class CollectionRoute(val type: String, val id: String, val name: String, val coverArt: String? = null)

/**
 * Original: SeeAll { title, kind, items?, albumListType?, artistId? }.
 * Compose routes can't carry object lists, so search "See All" passes [query] and the screen re-runs the search.
 */
@Serializable data class SeeAllRoute(
    val title: String, val kind: String,
    val albumListType: String? = null, val artistId: String? = null, val query: String? = null,
)
