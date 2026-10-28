/**
 * Astryx Design Tokens for React Native (OptiMind)
 * Faithful implementation of Meta's Astryx design tokens (Neutral Theme)
 * Reference: https://astryx.atmeta.com
 */

export interface ThemeColors {
  accent: string;
  accentMuted: string;
  onAccent: string;
  neutral: string;
  backgroundBody: string;
  backgroundSurface: string;
  backgroundCard: string;
  backgroundPopover: string;
  backgroundMuted: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  textAccent: string;
  iconPrimary: string;
  iconSecondary: string;
  iconAccent: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  error: string;
  errorMuted: string;
  bubbleUser: string;
  bubbleUserText: string;
  bubbleAssistant: string;
  bubbleAssistantText: string;
  bubbleSystem: string;
  shadowColor: string;
}

// Astryx Neutral Dark (Default for Meta AI / Kapany)
export const darkTokens: ThemeColors = {
  accent: '#2694FE',
  accentMuted: 'rgba(38, 148, 254, 0.15)',
  onAccent: '#FFFFFF',
  neutral: 'rgba(255, 255, 255, 0.08)',
  backgroundBody: '#111112',
  backgroundSurface: '#18191B',
  backgroundCard: '#1F2024',
  backgroundPopover: '#28292D',
  backgroundMuted: 'rgba(255, 255, 255, 0.05)',
  borderSubtle: '#292B30',
  borderStrong: '#3A3D45',
  textPrimary: '#EDEDED',
  textSecondary: '#9A9EA7',
  textDisabled: '#5A5E66',
  textAccent: '#2694FE',
  iconPrimary: '#EDEDED',
  iconSecondary: '#9A9EA7',
  iconAccent: '#2694FE',
  success: '#12B76A',
  successMuted: 'rgba(18, 183, 106, 0.15)',
  warning: '#F79009',
  warningMuted: 'rgba(247, 144, 9, 0.15)',
  error: '#F04438',
  errorMuted: 'rgba(240, 68, 56, 0.15)',
  bubbleUser: '#0064E0',
  bubbleUserText: '#FFFFFF',
  bubbleAssistant: '#18191B',
  bubbleAssistantText: '#EDEDED',
  bubbleSystem: 'rgba(255, 255, 255, 0.04)',
  shadowColor: '#000000',
};

// Astryx Neutral Light
export const lightTokens: ThemeColors = {
  accent: '#0064E0',
  accentMuted: 'rgba(0, 100, 224, 0.08)',
  onAccent: '#FFFFFF',
  neutral: 'rgba(5, 54, 89, 0.06)',
  backgroundBody: '#F5F7F9',
  backgroundSurface: '#FFFFFF',
  backgroundCard: '#FFFFFF',
  backgroundPopover: '#FFFFFF',
  backgroundMuted: 'rgba(5, 54, 89, 0.04)',
  borderSubtle: '#E2E6EA',
  borderStrong: '#CBD2D9',
  textPrimary: '#0A1317',
  textSecondary: '#4E606F',
  textDisabled: '#A4B0BC',
  textAccent: '#0064E0',
  iconPrimary: '#0A1317',
  iconSecondary: '#4E606F',
  iconAccent: '#0064E0',
  success: '#0D8626',
  successMuted: 'rgba(13, 134, 38, 0.10)',
  warning: '#D97706',
  warningMuted: 'rgba(217, 119, 6, 0.10)',
  error: '#D92D20',
  errorMuted: 'rgba(217, 45, 32, 0.10)',
  bubbleUser: '#0064E0',
  bubbleUserText: '#FFFFFF',
  bubbleAssistant: '#FFFFFF',
  bubbleAssistantText: '#0A1317',
  bubbleSystem: 'rgba(5, 54, 89, 0.04)',
  shadowColor: '#000000',
};

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
};

export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  med: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
};
