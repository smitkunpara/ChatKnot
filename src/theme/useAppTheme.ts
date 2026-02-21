// @ts-nocheck
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useSettingsStore } from '../store/useSettingsStore';

export type ResolvedTheme = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface AppPalette {
  mode: ResolvedTheme;
  background: string;
  surface: string;
  surfaceAlt: string;
  panel: string;
  header: string;
  border: string;
  subtleBorder: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  placeholder: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  danger: string;
  onDanger: string;
  dangerSoft: string;
  success: string;
  overlay: string;
  userBubble: string;
  assistantBubble: string;
  inputBackground: string;
  inputBorder: string;
  toolCard: string;
  toolCardHeader: string;
  codeBackground: string;
  link: string;
}

const darkPalette: AppPalette = {
  mode: 'dark',
  background: '#202123',
  surface: '#2a2b2e',
  surfaceAlt: '#313338',
  panel: '#2b2d31',
  header: '#202225',
  border: '#3a3d42',
  subtleBorder: '#4a4e55',
  text: '#eceff4',
  textSecondary: '#b6bcc8',
  textTertiary: '#9097a3',
  placeholder: '#7f8794',
  primary: '#21c37d',
  onPrimary: '#042014',
  primarySoft: '#243b33',
  danger: '#ef4444',
  onDanger: '#ffffff',
  dangerSoft: '#4a252b',
  success: '#22c55e',
  overlay: 'rgba(0,0,0,0.5)',
  userBubble: '#2f3237',
  assistantBubble: '#292b30',
  inputBackground: '#2f3237',
  inputBorder: '#4b515b',
  toolCard: '#2a2d32',
  toolCardHeader: '#24272c',
  codeBackground: '#1f2126',
  link: '#63d6a6',
};

const lightPalette: AppPalette = {
  mode: 'light',
  background: '#f7f7f8',
  surface: '#ffffff',
  surfaceAlt: '#f2f3f5',
  panel: '#ffffff',
  header: '#ffffff',
  border: '#e5e7eb',
  subtleBorder: '#d8dde4',
  text: '#111827',
  textSecondary: '#4b5563',
  textTertiary: '#6b7280',
  placeholder: '#9ca3af',
  primary: '#10a37f',
  onPrimary: '#ffffff',
  primarySoft: '#e7f6f0',
  danger: '#dc2626',
  onDanger: '#ffffff',
  dangerSoft: '#ffe3e3',
  success: '#10a37f',
  overlay: 'rgba(17,24,39,0.2)',
  userBubble: '#ffffff',
  assistantBubble: '#f7f8fa',
  inputBackground: '#ffffff',
  inputBorder: '#d5dae1',
  toolCard: '#ffffff',
  toolCardHeader: '#f7f8fa',
  codeBackground: '#f3f4f6',
  link: '#0f8c6d',
};

export const getPalette = (mode: ResolvedTheme): AppPalette =>
  mode === 'dark' ? darkPalette : lightPalette;

export const useAppTheme = () => {
  const preference = (useSettingsStore(state => state.theme) as ThemePreference) || 'system';
  const systemScheme = useColorScheme();

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (preference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return preference;
  }, [preference, systemScheme]);

  const colors = useMemo(() => getPalette(resolvedTheme), [resolvedTheme]);

  return {
    themePreference: preference,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    colors,
  };
};

export const getNavigationTheme = (colors: AppPalette) => {
  const baseTheme = colors.mode === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.header,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
};
