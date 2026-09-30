import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZES } from '../constants/theme';
import { useTheme, ThemePreference } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAuthCache } from '../services/subsonic';

interface SettingsScreenProps {
  onLogout: () => void;
}

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Auto', value: 'system' },
];

export function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const [server, setServer] = React.useState('—');
  const [username, setUsername] = React.useState('—');
  const [localMode, setLocalMode] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const loadConfig = async () => {
      try {
        const [configRaw, localModeRaw] = await Promise.all([
          AsyncStorage.getItem('serverConfig'),
          AsyncStorage.getItem('localMode'),
        ]);
        if (!mounted) return;
        setLocalMode(localModeRaw === 'true');
        if (!configRaw) return;
        const config = JSON.parse(configRaw);
        if (!mounted) return;
        setServer(config.serverUrl || '—');
        setUsername(config.username || '—');
      } catch (error) {
        console.warn('Failed to load server config', error);
      }
    };
    loadConfig();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = () => {
    if (localMode) {
      onLogout();
      return;
    }
    Alert.alert(
      'Logout',
      'Are you sure you want to disconnect?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('serverConfig');
            clearAuthCache();
            onLogout();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Appearance</Text>
            <View style={[styles.themePicker, { backgroundColor: colors.border }]}>
              {THEME_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.themeOption, preference === opt.value && { backgroundColor: colors.background }]}
                  onPress={() => setPreference(opt.value)}
                >
                  <Text style={[styles.themeOptionText, { color: preference === opt.value ? colors.text : colors.textMuted }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Server</Text>
            <Text style={styles.value}>{server}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Username</Text>
            <Text style={styles.value}>{username}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>App Version</Text>
            <Text style={styles.value}>1.0.0</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>API Version</Text>
            <Text style={styles.value}>Subsonic 1.16.1</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>{localMode ? 'Connect to server' : 'Disconnect'}</Text>
      </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: { surface: string; textSecondary: string; background: string; border: string; text: string; error: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: colors.text,
    },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      padding: SPACING.md,
    },
    section: {
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: SPACING.sm,
      marginLeft: SPACING.xs,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: 12,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: SPACING.md,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: SPACING.md,
    },
    label: {
      fontSize: FONT_SIZES.md,
      color: colors.text,
    },
    helper: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
      marginTop: 4,
    },
    value: {
      fontSize: FONT_SIZES.md,
      color: colors.textSecondary,
    },
    debugLine: {
      fontSize: FONT_SIZES.xs,
      color: colors.textSecondary,
      fontFamily: 'monospace',
      paddingVertical: 2,
    },
    copyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.sm,
      marginTop: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    copyText: {
      fontSize: FONT_SIZES.sm,
      color: colors.text,
      marginLeft: SPACING.xs,
      fontWeight: '600',
    },
    themePicker: {
      flexDirection: 'row',
      borderRadius: 8,
      padding: 2,
    },
    themeOption: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      borderRadius: 6,
      minWidth: 52,
      alignItems: 'center',
    },
    themeOptionText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
    },
    logoutBtn: {
      backgroundColor: colors.error,
      borderRadius: 12,
      padding: SPACING.md,
      alignItems: 'center',
      marginTop: SPACING.xl,
    },
    logoutText: {
      color: '#FFFFFF',
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
    },
  });
