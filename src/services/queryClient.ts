import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 24 hours — matches persister maxAge so in-memory and disk eviction stay in sync
const CACHE_TTL = 1000 * 60 * 60 * 24;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min: serve from cache, background-refetch after
      gcTime: CACHE_TTL,
      retry: 2,
    },
  },
});

// Persists the query cache to AsyncStorage so Home data loads instantly on next app open
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  throttleTime: 1000, // batch writes — avoids write storm on rapid invalidations
});
