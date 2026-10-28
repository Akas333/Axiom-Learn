import React, { createContext, useContext, useState, useMemo } from 'react';
import { themes, defaultThemeSlug, ThemeSlug } from '../astryx-themes';
import { defineTheme, registerTheme } from '@astryxdesign/core/theme';
import { ThemeColors, radius as defaultRadius, spacing, shadows } from './tokens';

export type RadiusScale = 'standard' | 'pill' | 'sharp';

interface ThemeContextType {
  themeSlug: ThemeSlug;
  setThemeSlug: (slug: ThemeSlug) => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  toggleTheme: () => void;
  customAccent: string | null;
  setCustomAccent: (accent: string | null) => void;
  radiusScale: RadiusScale;
  setRadiusScale: (scale: RadiusScale) => void;
  colors: ThemeColors;
  radius: typeof defaultRadius;
  spacing: typeof spacing;
  shadows: typeof shadows;
  activeAstryxTheme: any;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

/**
 * Helper to extract light or dark value from Astryx "light-dark(light, dark)" token string
 */
function parseLightDark(str: string | undefined, isDark: boolean): string | undefined {
  if (!str) return undefined;
  const match = str.match(/light-dark\(\s*(.*?)\s*,\s*(.*?)\s*\)/);
  if (match) {
    return isDark ? match[2].trim() : match[1].trim();
  }
  return str;
}

/**
 * Maps raw Astryx theme tokens to mobile ThemeColors
 */
function mapAstryxTokensToColors(astryxTheme: any, isDark: boolean, customAccent: string | null): ThemeColors {
  const t = astryxTheme?.tokens || {};

  const get = (key: string, fallback: string) => {
    const val = parseLightDark(t[key], isDark);
    return val || fallback;
  };

  // Base accent from Astryx theme or custom override
  const rawAccent = customAccent || get('--color-accent', isDark ? '#2694FE' : '#0064E0');
  const accent = rawAccent.startsWith('#') ? rawAccent : (isDark ? '#2694FE' : '#0064E0');

  const bgBody = get('--color-background-body', isDark ? '#111112' : '#F5F7F9');
  const bgSurface = get('--color-background-surface', isDark ? '#18191B' : '#FFFFFF');
  const bgCard = get('--color-background-card', isDark ? '#1F2024' : '#FFFFFF');
  const bgPopover = get('--color-background-popover', isDark ? '#28292D' : '#FFFFFF');
  const bgMuted = get('--color-background-muted', isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(5, 54, 89, 0.04)');

  const textPrimary = get('--color-text-primary', isDark ? '#EDEDED' : '#0A1317');
  const textSecondary = get('--color-text-secondary', isDark ? '#9A9EA7' : '#4E606F');
  const textDisabled = get('--color-text-disabled', isDark ? '#5A5E66' : '#A4B0BC');
  const textAccent = accent;

  const borderSubtle = get('--color-border', isDark ? '#292B30' : '#E2E6EA');
  const borderStrong = get('--color-border-emphasized', isDark ? '#3A3D45' : '#CBD2D9');

  const success = get('--color-success', isDark ? '#12B76A' : '#0D8626');
  const warning = get('--color-warning', isDark ? '#F79009' : '#D97706');
  const error = get('--color-error', isDark ? '#F04438' : '#D92D20');

  return {
    accent,
    accentMuted: customAccent ? `${accent}26` : get('--color-accent-muted', isDark ? 'rgba(38, 148, 254, 0.15)' : 'rgba(0, 100, 224, 0.08)'),
    onAccent: '#FFFFFF',
    neutral: get('--color-neutral', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(5, 54, 89, 0.06)'),
    backgroundBody: bgBody,
    backgroundSurface: bgSurface,
    backgroundCard: bgCard,
    backgroundPopover: bgPopover,
    backgroundMuted: bgMuted,
    borderSubtle: borderSubtle,
    borderStrong: borderStrong,
    textPrimary: textPrimary,
    textSecondary: textSecondary,
    textDisabled: textDisabled,
    textAccent: textAccent,
    iconPrimary: textPrimary,
    iconSecondary: textSecondary,
    iconAccent: accent,
    success: success,
    successMuted: isDark ? 'rgba(18, 183, 106, 0.15)' : 'rgba(13, 134, 38, 0.10)',
    warning: warning,
    warningMuted: isDark ? 'rgba(247, 144, 9, 0.15)' : 'rgba(217, 119, 6, 0.10)',
    error: error,
    errorMuted: isDark ? 'rgba(240, 68, 56, 0.15)' : 'rgba(217, 45, 32, 0.10)',
    bubbleUser: customAccent || (rawAccent === '#f1f1f1' ? '#0064E0' : accent),
    bubbleUserText: '#FFFFFF',
    bubbleAssistant: bgSurface,
    bubbleAssistantText: textPrimary,
    bubbleSystem: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(5, 54, 89, 0.04)',
    shadowColor: '#000000',
  };
}

export interface ThemeProps {
  theme?: any;
  children: React.ReactNode;
}

/**
 * Astryx Theme Provider
 * Integrates Astryx design system themes (neutral, stone, gothic, matcha)
 * Supports dynamic theme switching and defineTheme() customizations
 */
export const Theme: React.FC<ThemeProps> = ({ theme: initialTheme, children }) => {
  const [themeSlug, setThemeSlug] = useState<ThemeSlug>(defaultThemeSlug);
  const [isDark, setIsDark] = useState<boolean>(true);
  const [customAccent, setCustomAccent] = useState<string | null>(null);
  const [radiusScale, setRadiusScale] = useState<RadiusScale>('standard');

  const toggleTheme = () => setIsDark((prev) => !prev);

  // Derive base Astryx theme from selected slug or initialTheme
  const baseAstryxTheme = useMemo(() => {
    if (themeSlug && themes[themeSlug]) {
      return themes[themeSlug];
    }
    return initialTheme || themes[defaultThemeSlug];
  }, [themeSlug, initialTheme]);

  // Compute active theme with defineTheme() customization if customAccent is active
  const activeAstryxTheme = useMemo(() => {
    if (customAccent) {
      const custom = defineTheme({
        name: `${themeSlug}-custom-${customAccent.replace('#', '')}`,
        extends: baseAstryxTheme,
        tokens: {
          '--color-accent': [customAccent, customAccent],
        },
      });
      registerTheme(custom);
      return custom;
    }
    registerTheme(baseAstryxTheme);
    return baseAstryxTheme;
  }, [baseAstryxTheme, customAccent, themeSlug]);

  // Map to mobile tokens
  const colors = useMemo(() => {
    return mapAstryxTokensToColors(activeAstryxTheme, isDark, customAccent);
  }, [activeAstryxTheme, isDark, customAccent]);

  // Compute radius based on radiusScale
  const activeRadius = useMemo(() => {
    switch (radiusScale) {
      case 'pill':
        return {
          none: 0,
          sm: 10,
          md: 16,
          lg: 22,
          xl: 30,
          full: 9999,
        };
      case 'sharp':
        return {
          none: 0,
          sm: 2,
          md: 4,
          lg: 6,
          xl: 8,
          full: 9999,
        };
      case 'standard':
      default:
        return defaultRadius;
    }
  }, [radiusScale]);

  const value = useMemo(
    () => ({
      themeSlug,
      setThemeSlug,
      isDark,
      setIsDark,
      toggleTheme,
      customAccent,
      setCustomAccent,
      radiusScale,
      setRadiusScale,
      colors,
      radius: activeRadius,
      spacing,
      shadows,
      activeAstryxTheme,
    }),
    [
      themeSlug,
      isDark,
      customAccent,
      radiusScale,
      colors,
      activeRadius,
      activeAstryxTheme,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const ThemeProvider = Theme;

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a Theme / ThemeProvider');
  }
  return context;
};
