package com.drift.app.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drift.app.di.AppGraph
import com.drift.app.model.Album
import com.drift.app.model.Song

/** components/AlbumCard.tsx (+AlbumCardWithCover: the cover URL is resolved synchronously here). */
@Composable
fun AlbumCard(name: String, artist: String, coverArt: String?, modifier: Modifier = Modifier, songCount: Int? = null, durationSec: Int? = null, onClick: () -> Unit) {
    val c = Drift.colors
    Column(modifier.padding(bottom = Spacing.md).tap(onClick)) {
        CoverImage(coverUrl(coverArt, 300), Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(8.dp)).background(c.surface)) {
            Text("♪", color = c.textMuted, fontSize = 40.sp)
        }
        Spacer(Modifier.height(Spacing.sm))
        Text(name, color = c.text, fontSize = Fonts.md, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(artist, color = c.textSecondary, fontSize = Fonts.sm, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (songCount != null && durationSec != null) Text("$songCount songs • ${formatTotal(durationSec)}", color = c.textMuted, fontSize = Fonts.xs, maxLines = 1, modifier = Modifier.padding(top = 2.dp))
    }
}

/** components/AlbumHorizontalList.tsx */
@Composable
fun AlbumHorizontalList(albums: List<Album>, itemWidth: Dp = 180.dp, itemSpacing: Dp = Spacing.sm, onAlbumPress: (Album) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = Spacing.md)) {
        itemsIndexed(albums, key = { i, a -> "${a.id}-$i" }) { _, a ->
            AlbumCard(a.name.ifBlank { "Unknown Album" }, a.artist, a.coverArt, Modifier.width(itemWidth).padding(end = itemSpacing), a.songCount, a.durationSec) { onAlbumPress(a) }
        }
    }
}

/** components/TrackHorizontalList.tsx */
@Composable
fun TrackHorizontalList(tracks: List<Song>, itemWidth: Dp = 180.dp, itemSpacing: Dp = Spacing.sm, onTrackPress: (Song) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = Spacing.md)) {
        itemsIndexed(tracks, key = { i, s -> "${s.id}-$i" }) { _, s ->
            AlbumCard(s.title.ifBlank { "Unknown Track" }, s.artist.ifBlank { "Unknown Artist" }, s.coverArt ?: s.albumId ?: s.id, Modifier.width(itemWidth).padding(end = itemSpacing)) { onTrackPress(s) }
        }
    }
}

/** components/TrackItem.tsx */
@Composable
fun TrackItem(
    song: Song, onClick: () -> Unit, isPlaying: Boolean = false, showNumber: Boolean = false, showHeart: Boolean = true,
    isRemovalMode: Boolean = false, onRemove: () -> Unit = {},
) {
    val c = Drift.colors
    val starred by AppGraph.actions.starredIds.collectAsState()
    val hearted = song.id in starred
    val shape = RoundedCornerShape(8.dp)
    Row(
        Modifier.fillMaxWidth().then(if (isPlaying) Modifier.clip(shape).background(c.surfaceLight) else Modifier).tap(onClick)
            .padding(horizontal = Spacing.md, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showNumber) Text(song.track.toString(), color = c.textMuted, fontSize = Fonts.sm, modifier = Modifier.width(24.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        CoverImage(coverUrl(song.coverArt ?: song.albumId ?: song.id, 100), Modifier.size(48.dp).clip(RoundedCornerShape(4.dp)).background(c.surfaceLight)) { DiskArtwork(30.dp) }
        Column(Modifier.weight(1f).padding(start = Spacing.sm)) {
            Text(song.title, color = if (isPlaying) c.primary else c.text, fontSize = Fonts.md, fontWeight = if (isPlaying) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(2.dp))
            Text(song.artist + if (song.year > 0) " • ${song.year}" else "", color = c.textSecondary, fontSize = Fonts.sm, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (showHeart && !isRemovalMode) Icon(
            if (hearted) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, "Favourite", Modifier.padding(horizontal = Spacing.xs).size(20.dp).tap { AppGraph.actions.toggleStar(song) },
            tint = if (hearted) c.primary else c.textMuted,
        )
        if (isRemovalMode) Icon(Icons.Rounded.DeleteOutline, "Remove", Modifier.padding(horizontal = Spacing.xs).size(20.dp).tap(onRemove), tint = c.error)
        Text(formatDuration(song.durationSec), color = c.textMuted, fontSize = Fonts.sm, modifier = Modifier.padding(start = Spacing.sm))
    }
}
