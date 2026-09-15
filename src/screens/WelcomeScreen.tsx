import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useThemeColors } from '../context/ThemeContext';
import { ping, clearAuthCache } from '../services/subsonic';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WelcomeScreenProps {
  onConnect: () => void;
}

export function WelcomeScreen({ onConnect }: WelcomeScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const defaultServerUrl = '';
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    const loadConfig = async () => {
      try {
        const configRaw = await AsyncStorage.getItem('serverConfig');
        if (!configRaw) return;
        const config = JSON.parse(configRaw);
        if (!mounted) return;
        setServerUrl(config.serverUrl || defaultServerUrl);
        setUsername(config.username || '');
        setPassword(config.password || '');
      } catch (error) {
        console.warn('Failed to load server config', error);
      }
    };
    loadConfig();
    return () => {
      mounted = false;
    };
  }, []);

  const handleConnect = async () => {
    const trimmedServer = serverUrl.trim();
    const withScheme = /^https?:\/\//i.test(trimmedServer)
      ? trimmedServer
      : `http://${trimmedServer}`;
    const normalizedServer = withScheme.replace(/\/+$/, '');

    if (!normalizedServer || !username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      // Save config
      await AsyncStorage.setItem('serverConfig', JSON.stringify({ serverUrl: normalizedServer, username, password }));
      clearAuthCache();
      // Validate server before entering app
      const ok = await ping();
      if (!ok) {
        throw new Error(`Ping failed for ${normalizedServer}`);
      }
      onConnect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', `Failed to connect. ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        <Text style={styles.logo}>♪</Text>
        <Text style={styles.title}>Drift</Text>
        <Text style={styles.subtitle}>Connect to your music server</Text>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Server URL</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
          placeholder="https://music.example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Username"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Connecting...' : 'Connect'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: { background: string; primary: string; textSecondary: string; text: string; surface: string; border: string; textMuted: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      padding: SPACING.xl,
    },
    logo: {
      fontSize: 64,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: FONT_SIZES.xxxl,
      fontWeight: 'bold',
      textAlign: 'center',
      color: colors.primary,
      marginBottom: SPACING.xs,
    },
    subtitle: {
      fontSize: FONT_SIZES.md,
      textAlign: 'center',
      color: colors.textSecondary,
      marginBottom: SPACING.xl,
    },
    form: {
      gap: SPACING.md,
    },
    inputGroup: {
      marginBottom: SPACING.md,
    },
    label: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: colors.text,
      marginBottom: SPACING.xs,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: SPACING.md,
      fontSize: FONT_SIZES.md,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: SPACING.md,
      alignItems: 'center',
      marginTop: SPACING.md,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
    },
    quickSelect: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginBottom: SPACING.md,
    },
    quickBtn: {
      flex: 1,
      padding: SPACING.sm,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    quickBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    quickBtnText: {
      color: colors.text,
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
    },
    quickBtnTextActive: {
      color: '#FFFFFF',
    },
  });
