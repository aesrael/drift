export const LIGHT_COLORS = {
  primary: '#E2211C',
  primaryDark: '#B81813',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceLight: '#FAFAFA',
  text: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#999999',
  border: '#E0E0E0',
  error: '#D32F2F',
  success: '#388E3C',
  tertiary: '#8B5CF6',
  tertiaryLight: '#A78BFA',
  glass: 'rgba(255, 255, 255, 0.8)',
  glassBorder: 'rgba(0, 0, 0, 0.05)',
  overlay: 'rgba(0, 0, 0, 0.1)',
};

export const DARK_COLORS = {
  primary: '#E2211C',
  primaryDark: '#B81813',
  background: '#010101',
  surface: '#0F1115',
  surfaceLight: '#161920',
  text: '#F5F5F5',
  textSecondary: '#C7C9D1',
  textMuted: '#8C909B',
  border: '#1F2229',
  error: '#FF6B6B',
  success: '#5DD26F',
  tertiary: '#A78BFA',
  tertiaryLight: '#C4B5FD',
  glass: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.3)',
};

export type ThemeColors = typeof LIGHT_COLORS;

export const COLORS = LIGHT_COLORS;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const API_CONFIG = {
  baseUrl: '',
  username: '',
  password: '',
};
