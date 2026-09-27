import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, DeviceEventEmitter, Text, Linking } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { syncStarredDownloads } from './src/services/downloadService';
import { getArtists } from './src/services/subsonic';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister } from './src/services/queryClient';

import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { PlayerProvider, usePlayer } from './src/context/PlayerContext';
import { QueueSource } from './src/types';
import { trackPlayerManager } from './src/services/trackPlayerManager';
import { ConnectedMiniPlayer } from './src/components';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { LocalFilesScreen } from './src/screens/LocalFilesScreen';
import { QuickPlayScreen } from './src/screens/QuickPlayScreen';
import { PlaylistsScreen } from './src/screens/PlaylistsScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { CollectionDetailsScreen } from './src/screens/CollectionDetailsScreen';
import { SeeAllScreen } from './src/screens/SeeAllScreen';
import { NowPlayingScreen } from './src/screens/NowPlayingScreen';


const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();


function HomeStack() {
  const Stack = createNativeStackNavigator();
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="QuickPlayMain" component={QuickPlayScreen} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="CollectionDetails" component={CollectionDetailsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="SeeAll" component={SeeAllScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="NowPlaying" component={NowPlayingScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Settings">
        {props => <SettingsScreen {...props} onLogout={() => DeviceEventEmitter.emit('auth.logout')} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function LibraryStack() {
  const Stack = createNativeStackNavigator();
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="PlaylistsMain" component={PlaylistsScreen} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="CollectionDetails" component={CollectionDetailsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="SeeAll" component={SeeAllScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}


function DownloadsStack() {
  const Stack = createNativeStackNavigator();
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="DownloadsMain" component={DownloadsScreen} />
      <Stack.Screen name="CollectionDetails" component={CollectionDetailsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="SeeAll" component={SeeAllScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}

function LocalStack() {
  const Stack = createNativeStackNavigator();
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="LocalFilesMain" component={LocalFilesScreen} />
      <Stack.Screen name="NowPlaying" component={NowPlayingScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Settings">
        {props => <SettingsScreen {...props} onLogout={() => DeviceEventEmitter.emit('auth.logout')} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function TabNavigator({ hideMiniplayer, localMode }: { hideMiniplayer: boolean; localMode: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;
  const styles = useMemo(() => createStyles(colors, bottomInset), [colors, bottomInset]);

  return (
    <View style={styles.container}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
        }}
      >
        {localMode ? (
          <Tab.Screen
            name="Local"
            component={LocalStack}
            options={{
              tabBarLabel: 'My Music',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="folder-open-outline" size={size} color={color} />
              ),
            }}
          />
        ) : (
          <>
            <Tab.Screen
              name="Home"
              component={HomeStack}
              options={{
                tabBarLabel: 'Play',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="play-circle-outline" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen
              name="Library"
              component={LibraryStack}
              options={{
                tabBarLabel: 'Library',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="library-outline" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen
              name="Downloads"
              component={DownloadsStack}
              options={{
                tabBarLabel: 'Downloads',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="download-outline" size={size} color={color} />
                ),
              }}
            />
          </>
        )}
      </Tab.Navigator>
      {!hideMiniplayer && <ConnectedMiniPlayer />}
    </View>
  );
}

function AssistantIntentHandler() {
  const { currentTrack, queue, isPlaying, queueSource, play, setAutoQueueEnabled } = usePlayer();
  const lastHandledRef = React.useRef<{ url: string | null; at: number }>({ url: null, at: 0 });
  const currentTrackRef = React.useRef(currentTrack);
  const queueRef = React.useRef(queue);
  const isPlayingRef = React.useRef(isPlaying);
  const queueSourceRef = React.useRef(queueSource);
  const retryIntervalRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryStartTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    queueRef.current = queue;
    isPlayingRef.current = isPlaying;
    queueSourceRef.current = queueSource;
  }, [currentTrack, queue, isPlaying, queueSource]);

  const clearRetry = React.useCallback(() => {
    if (retryStartTimeoutRef.current) {
      clearTimeout(retryStartTimeoutRef.current);
      retryStartTimeoutRef.current = null;
    }
    if (retryIntervalRef.current) {
      clearTimeout(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
  }, []);

  const waitForPlaybackStart = React.useCallback(async (): Promise<boolean> => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      try {
        const progress = await trackPlayerManager.getProgress();
        if (progress.isPlaying || progress.position > 1000) {
          return true;
        }
      } catch {
        // best-effort
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }, []);

  const resolvePlayableSession = React.useCallback(async (): Promise<{
    track: any;
    queue: any[];
    queueSource?: QueueSource;
  } | null> => {
    const liveCurrentTrack = currentTrackRef.current;
    if (liveCurrentTrack?.id) {
      const liveQueue = Array.isArray(queueRef.current) && queueRef.current.length > 0
        ? queueRef.current
        : [liveCurrentTrack];
      return {
        track: liveCurrentTrack,
        queue: liveQueue,
        queueSource: queueSourceRef.current || undefined,
      };
    }

    const persistedRaw = await AsyncStorage.getItem('lastSession');
    if (!persistedRaw) return null;
    try {
      const persisted = JSON.parse(persistedRaw) as {
        track?: any;
        queue?: any[];
        queueSource?: QueueSource;
      };
      if (!persisted?.track?.id) return null;
      const persistedQueue = Array.isArray(persisted.queue) && persisted.queue.length > 0
        ? persisted.queue
        : [persisted.track];
      return {
        track: persisted.track,
        queue: persistedQueue,
        queueSource: persisted.queueSource || undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const tryContinueCurrent = React.useCallback(async (): Promise<boolean> => {
    if (isPlayingRef.current) {
      const alreadyStarted = await waitForPlaybackStart();
      if (alreadyStarted) return true;
    }

    const session = await resolvePlayableSession();
    if (!session?.track?.id) return false;

    play(session.track, session.queue, true, session.queueSource);
    setAutoQueueEnabled(false);
    return waitForPlaybackStart();
  }, [play, resolvePlayableSession, setAutoQueueEnabled, waitForPlaybackStart]);

  const handleAssistantUrl = React.useCallback(async (url: string | null) => {
    if (!url) return;
    const now = Date.now();
    if (lastHandledRef.current.url === url && now - lastHandledRef.current.at < 1200) return;
    lastHandledRef.current = { url, at: now };

    const normalized = url.toLowerCase().trim();
    const isFreePlayCommand =
      normalized === 'drift://play/free' ||
      normalized.startsWith('drift://play/free?');

    if (!isFreePlayCommand) {
      return;
    }

    try {
      clearRetry();
      // Cold-start intents can arrive before PlayerContext hydration/setup.
      // Give app boot a brief head start, then try 3 times at 1s intervals.
      retryStartTimeoutRef.current = setTimeout(() => {
        const maxAttempts = 3;
        const runAttempt = async (attempt: number) => {
          if (attempt > maxAttempts) {
            clearRetry();
            return;
          }
          const ok = await tryContinueCurrent();
          if (ok) {
            clearRetry();
            return;
          }
          retryIntervalRef.current = setTimeout(() => {
            void runAttempt(attempt + 1);
          }, 1000);
        };
        void runAttempt(1);
      }, 1500);

      // No fallback beyond current/last selected track.
      return;
    } catch (error) {
      console.error('[AssistantIntentHandler] Failed to continue current track', error);
    }
  }, [clearRetry, tryContinueCurrent]);

  useEffect(() => {
    Linking.getInitialURL().then(handleAssistantUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAssistantUrl(url);
    });
    return () => {
      clearRetry();
      subscription.remove();
    };
  }, [clearRetry, handleAssistantUrl]);

  return null;
}

function AppRoot() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isNowPlayingActive, setIsNowPlayingActive] = useState(false);
  // Keep hook slot compatibility after removing navReady gating.
  // This prevents Fast Refresh hook-order crashes on live clients.
  const [_navReadyCompat] = useState(true);
  const { colors, isDark } = useTheme();

  const checkNowPlayingActive = (state: any): boolean => {
    if (!state) return false;
    const route = state.routes?.[state.index ?? 0];
    if (!route) return false;
    if (route.name === 'NowPlaying') return true;
    return checkNowPlayingActive(route.state);
  };

  useEffect(() => {
    checkAuth();
    const subscription = DeviceEventEmitter.addListener('auth.logout', () => {
      AsyncStorage.removeItem('localMode').catch(() => {});
      setIsLocalMode(false);
      setIsConnected(false);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const checkAuth = async () => {
    try {
      const [config, localMode] = await Promise.all([
        AsyncStorage.getItem('serverConfig'),
        AsyncStorage.getItem('localMode'),
      ]);
      if (localMode === 'true') {
        setIsLocalMode(true);
        setIsConnected(true);
      } else if (config) {
        setIsConnected(true);
        syncStarredDownloads(); // best-effort, fire and forget
        getArtists(0, 50).catch(() => {}); // pre-warm artists cache
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWelcomeConnect = async () => {
    try {
      const localMode = await AsyncStorage.getItem('localMode');
      setIsLocalMode(localMode === 'true');
    } catch {
      setIsLocalMode(false);
    }
    setIsConnected(true);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  const navigationTheme: Theme = useMemo(() => {
    const baseTheme = isDark ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    };
  }, [colors, isDark]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <Text style={{ color: colors.text }}>Loading...</Text>
      </View>
    );
  }

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <WelcomeScreen onConnect={handleWelcomeConnect} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={navigationTheme}
      onStateChange={(state) => setIsNowPlayingActive(checkNowPlayingActive(state))}
    >
      <PlayerProvider>
        <AssistantIntentHandler />
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
          <TabNavigator hideMiniplayer={isNowPlayingActive} localMode={isLocalMode} />
        </SafeAreaView>
      </PlayerProvider>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister, maxAge: 1000 * 60 * 60 * 24 }}
        >
          <AppRoot />
        </PersistQueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const createStyles = (colors: { background: string; border: string; textMuted?: string; primary?: string; text?: string }, bottomInset = 0) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    tabBar: {
      backgroundColor: colors.background,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      height: 60 + bottomInset,
      paddingBottom: Math.max(8, bottomInset),
      paddingTop: 8,
    },
  });
