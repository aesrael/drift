package com.drift.app.data

import androidx.compose.runtime.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.coroutines.cancellation.CancellationException

/** Tiny stale-while-revalidate cache. Main-thread only. */
class QueryCache {
    private class Entry(val value: Any, val at: Long)
    private val map = HashMap<String, Entry>()
    private val _epoch = MutableStateFlow(0)
    val epoch: StateFlow<Int> = _epoch.asStateFlow()

    @Suppress("UNCHECKED_CAST") fun <T> peek(key: String): T? = map[key]?.value as? T
    fun fresh(key: String, ttlMs: Long) = map[key]?.let { nowMs() - it.at < ttlMs } ?: false
    fun put(key: String, v: Any) { map[key] = Entry(v, nowMs()) }

    /** Drop everything whose key starts with [prefix] (or everything) and tell mounted queries to reload. */
    fun invalidate(prefix: String = "") {
        map.keys.filter { it.startsWith(prefix) }.forEach { map.remove(it) }
        _epoch.value++
    }
}

class QueryState<T>(val data: T?, val loading: Boolean, val error: Throwable?, val refresh: () -> Unit)

@Composable
fun <T : Any> rememberQuery(cache: QueryCache, key: String, ttlMs: Long = 300_000, fetch: suspend () -> T): QueryState<T> {
    var tick by remember(key) { mutableIntStateOf(0) }
    var data by remember(key) { mutableStateOf(cache.peek<T>(key)) }
    var loading by remember(key) { mutableStateOf(data == null) }
    var error by remember(key) { mutableStateOf<Throwable?>(null) }
    val epoch by cache.epoch.collectAsState()
    val latest by rememberUpdatedState(fetch)
    LaunchedEffect(key, tick, epoch) {
        if (tick == 0 && cache.fresh(key, ttlMs)) { data = cache.peek(key); loading = false; return@LaunchedEffect }
        loading = true; error = null
        try {
            val v = latest()
            cache.put(key, v); data = v
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            error = e
        }
        loading = false
    }
    return QueryState(data, loading, error) { tick++ }
}
