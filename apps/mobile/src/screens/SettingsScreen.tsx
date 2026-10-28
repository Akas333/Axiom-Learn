import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, RadiusScale } from '../theme/ThemeContext';
import { ThemeSlug } from '../astryx-themes';
import { api } from '../services/api';

export interface SettingsScreenProps {
  onClose: () => void;
}

interface ThemeOption {
  slug: ThemeSlug;
  title: string;
  desc: string;
  badgeColor: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    slug: 'neutral',
    title: 'Neutral (Meta)',
    desc: 'The official Meta AI neutral palette with deep blacks & crisp contrast.',
    badgeColor: '#2694FE',
  },
  {
    slug: 'stone',
    title: 'Stone',
    desc: 'Warm slate-stone aesthetic with subtle lavender undercurrents.',
    badgeColor: '#8E8E9F',
  },
  {
    slug: 'gothic',
    title: 'Gothic',
    desc: 'Pure obsidian & deep midnight contrast built for nocturnal flow.',
    badgeColor: '#101314',
  },
  {
    slug: 'matcha',
    title: 'Matcha',
    desc: 'Earthy matcha green and sage tones inspired by organic tea ceremonies.',
    badgeColor: '#76935C',
  },
];

const ACCENT_PRESETS = [
  { label: 'Meta Blue', color: '#2694FE' },
  { label: 'Emerald', color: '#12B76A' },
  { label: 'Sunset Gold', color: '#F79009' },
  { label: 'Crimson', color: '#F04438' },
  { label: 'Violet Aura', color: '#8B5CF6' },
  { label: 'Matcha', color: '#76935C' },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose }) => {
  const {
    colors,
    isDark,
    toggleTheme,
    themeSlug,
    setThemeSlug,
    customAccent,
    setCustomAccent,
    radiusScale,
    setRadiusScale,
    radius,
    shadows,
  } = useTheme();

  const [hostUrl, setHostUrl] = useState(api.getBaseUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status?: number;
    error?: string;
  } | null>(null);

  const handleSaveHost = () => {
    api.setBaseUrl(hostUrl);
  };

  const handleTestConnection = async () => {
    handleSaveHost();
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message });
    } finally {
      setTesting(false);
    }
  };

  const setPreset = (url: string) => {
    setHostUrl(url);
    api.setBaseUrl(url);
    setTestResult(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundBody }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.backgroundSurface,
            borderBottomColor: colors.borderSubtle,
          },
        ]}
      >
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Settings & Appearance
          </Text>
          <View
            style={[
              styles.themeBadge,
              { backgroundColor: colors.accentMuted, borderColor: colors.accent },
            ]}
          >
            <Text style={[styles.themeBadgeText, { color: colors.accent }]}>
              {themeSlug.toUpperCase()}
            </Text>
          </View>
        </View>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={colors.iconPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Astryx Theme Family Selector */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="color-palette-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Astryx Theme Family
            </Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            Select from the installed Meta Astryx design system themes.
          </Text>

          <View style={styles.themesGrid}>
            {THEME_OPTIONS.map((opt) => {
              const selected = themeSlug === opt.slug;
              return (
                <Pressable
                  key={opt.slug}
                  onPress={() => setThemeSlug(opt.slug)}
                  style={({ pressed }) => [
                    styles.themeCardItem,
                    {
                      backgroundColor: selected
                        ? colors.accentMuted
                        : colors.backgroundSurface,
                      borderColor: selected ? colors.accent : colors.borderSubtle,
                      borderRadius: radius.md,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View style={styles.themeCardHeader}>
                    <View style={styles.themeSwatchRow}>
                      <View
                        style={[
                          styles.themeColorDot,
                          { backgroundColor: opt.badgeColor },
                        ]}
                      />
                      <Text
                        style={[
                          styles.themeItemTitle,
                          {
                            color: selected ? colors.accent : colors.textPrimary,
                            fontWeight: selected ? '700' : '600',
                          },
                        ]}
                      >
                        {opt.title}
                      </Text>
                    </View>
                    {selected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={colors.accent}
                      />
                    )}
                  </View>
                  <Text
                    style={[styles.themeItemDesc, { color: colors.textSecondary }]}
                  >
                    {opt.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Custom Accent via defineTheme */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="flash-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Accent Color (`defineTheme`)
            </Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            Overrides --color-accent token using Astryx defineTheme() API.
          </Text>

          <View style={styles.accentsRow}>
            {ACCENT_PRESETS.map((acc) => {
              const selected = customAccent === acc.color;
              return (
                <Pressable
                  key={acc.color}
                  onPress={() => setCustomAccent(acc.color)}
                  style={[
                    styles.accentButton,
                    {
                      borderColor: selected ? colors.textPrimary : 'transparent',
                      borderRadius: radius.full,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.accentSwatch,
                      { backgroundColor: acc.color, borderRadius: radius.full },
                    ]}
                  >
                    {selected && (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.accentLabel,
                      {
                        color: selected ? colors.textPrimary : colors.textSecondary,
                        fontWeight: selected ? '700' : '500',
                      },
                    ]}
                  >
                    {acc.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {customAccent && (
            <Pressable
              onPress={() => setCustomAccent(null)}
              style={[
                styles.resetAccentBtn,
                {
                  backgroundColor: colors.neutral,
                  borderRadius: radius.sm,
                },
              ]}
            >
              <Ionicons name="refresh-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.resetAccentText, { color: colors.textPrimary }]}>
                Reset to {themeSlug} Default Accent
              </Text>
            </Pressable>
          )}
        </View>

        {/* Appearance Mode & Corner Radius */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="shapes-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Appearance & Geometry
            </Text>
          </View>

          {/* Dark Mode toggle */}
          <View style={styles.settingRow}>
            <View>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                Dark Mode
              </Text>
              <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
                Switch between Astryx light and dark design tokens
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.neutral, true: colors.accent }}
              thumbColor={colors.onAccent}
            />
          </View>

          {/* Corner radius scale */}
          <Text style={[styles.sectionSubHeader, { color: colors.textSecondary }]}>
            Corner Radius Scale:
          </Text>
          <View style={styles.radiusRow}>
            {(['standard', 'pill', 'sharp'] as RadiusScale[]).map((scale) => {
              const selected = radiusScale === scale;
              const label =
                scale === 'standard'
                  ? 'Standard (10px)'
                  : scale === 'pill'
                  ? 'Pill (16px)'
                  : 'Sharp (4px)';
              return (
                <Pressable
                  key={scale}
                  onPress={() => setRadiusScale(scale)}
                  style={[
                    styles.radiusPill,
                    {
                      backgroundColor: selected
                        ? colors.accentMuted
                        : colors.backgroundSurface,
                      borderColor: selected ? colors.accent : colors.borderSubtle,
                      borderRadius:
                        scale === 'pill' ? 9999 : scale === 'sharp' ? 4 : 8,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.radiusPillText,
                      {
                        color: selected ? colors.accent : colors.textPrimary,
                        fontWeight: selected ? '700' : '500',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Live Token Preview Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="eye-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Live Astryx Theme Preview
            </Text>
          </View>

          <View
            style={[
              styles.previewContainer,
              {
                backgroundColor: colors.backgroundBody,
                borderColor: colors.borderSubtle,
                borderRadius: radius.md,
              },
            ]}
          >
            {/* Assistant bubble preview */}
            <View
              style={[
                styles.previewBubbleAssistant,
                {
                  backgroundColor: colors.bubbleAssistant,
                  borderColor: colors.borderSubtle,
                  borderRadius: radius.lg,
                },
              ]}
            >
              <Text style={[styles.previewBubbleText, { color: colors.bubbleAssistantText }]}>
                Astryx {themeSlug} theme active in {isDark ? 'Dark' : 'Light'} mode.
              </Text>
            </View>

            {/* User bubble preview */}
            <View
              style={[
                styles.previewBubbleUser,
                {
                  backgroundColor: colors.bubbleUser,
                  borderRadius: radius.lg,
                },
              ]}
            >
              <Text style={[styles.previewBubbleText, { color: colors.bubbleUserText }]}>
                ChatLayoutScrollButton wired smoothly!
              </Text>
            </View>

            {/* Scroll button pill preview */}
            <View style={styles.previewCenterPill}>
              <View
                style={[
                  styles.previewScrollButton,
                  {
                    backgroundColor: colors.backgroundSurface,
                    borderColor: colors.borderStrong,
                    borderRadius: radius.full,
                  },
                  shadows.med,
                ]}
              >
                <Ionicons name="arrow-down" size={14} color={colors.iconPrimary} />
                <Text style={[styles.previewScrollButtonText, { color: colors.textPrimary }]}>
                  Scroll to bottom
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Backend API Configuration */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="server-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Axiom Backend Server
            </Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            Connects to @axiom/server (Hono API mounted on port 8787).
          </Text>

          <TextInput
            value={hostUrl}
            onChangeText={setHostUrl}
            placeholder="http://localhost:8787"
            placeholderTextColor={colors.textDisabled}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                borderColor: colors.borderSubtle,
                backgroundColor: colors.backgroundSurface,
                borderRadius: radius.md,
              },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Quick presets */}
          <Text style={[styles.presetLabel, { color: colors.textSecondary }]}>
            Quick Presets:
          </Text>
          <View style={styles.presetsRow}>
            <Pressable
              onPress={() => setPreset('http://10.0.2.2:8787')}
              style={[
                styles.presetPill,
                { backgroundColor: colors.neutral, borderRadius: radius.sm },
              ]}
            >
              <Text style={[styles.presetText, { color: colors.textPrimary }]}>
                Android Emulator (10.0.2.2)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPreset('http://localhost:8787')}
              style={[
                styles.presetPill,
                { backgroundColor: colors.neutral, borderRadius: radius.sm },
              ]}
            >
              <Text style={[styles.presetText, { color: colors.textPrimary }]}>
                iOS / Reverse Proxy (localhost)
              </Text>
            </Pressable>
          </View>

          {/* Test connection button */}
          <Pressable
            onPress={handleTestConnection}
            disabled={testing}
            style={({ pressed }) => [
              styles.testButton,
              {
                backgroundColor: colors.accent,
                borderRadius: radius.md,
                opacity: testing ? 0.7 : pressed ? 0.9 : 1,
              },
            ]}
          >
            {testing ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <Text style={[styles.testButtonText, { color: colors.onAccent }]}>
                Test Connection
              </Text>
            )}
          </Pressable>

          {/* Status outcome */}
          {testResult ? (
            <View
              style={[
                styles.statusBanner,
                {
                  backgroundColor: testResult.ok
                    ? colors.successMuted
                    : colors.errorMuted,
                  borderRadius: radius.md,
                },
              ]}
            >
              <Ionicons
                name={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={testResult.ok ? colors.success : colors.error}
              />
              <Text
                style={[
                  styles.statusBannerText,
                  { color: testResult.ok ? colors.success : colors.error },
                ]}
              >
                {testResult.ok
                  ? 'Connected successfully to Axiom API'
                  : `Connection error: ${testResult.error || 'Server unreachable'}`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Model Stack Information */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Meta Models Powering OptiMind
            </Text>
          </View>

          <View style={styles.modelRow}>
            <Text style={[styles.modelRole, { color: colors.textPrimary }]}>
              Tutor & Pedagogical Flow:
            </Text>
            <Text style={[styles.modelName, { color: colors.accent }]}>
              Muse Spark 1.3
            </Text>
          </View>
          <View style={styles.modelRow}>
            <Text style={[styles.modelRole, { color: colors.textPrimary }]}>
              Knowledge Graph Agents:
            </Text>
            <Text style={[styles.modelName, { color: colors.accent }]}>
              Muse Spark Contributor
            </Text>
          </View>
          <View style={styles.modelRow}>
            <Text style={[styles.modelRole, { color: colors.textPrimary }]}>
              Hard Planning & Graph Synthesis:
            </Text>
            <Text style={[styles.modelName, { color: colors.accent }]}>
              Muse Wonder
            </Text>
          </View>
          <View style={styles.modelRow}>
            <Text style={[styles.modelRole, { color: colors.textPrimary }]}>
              Voice Dictation:
            </Text>
            <Text style={[styles.modelName, { color: colors.accent }]}>
              Muse Voice Transcribe
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  themeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 6,
  },
  themeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    padding: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 13,
    marginBottom: 12,
  },
  themesGrid: {
    gap: 10,
  },
  themeCardItem: {
    padding: 12,
    borderWidth: 1.5,
  },
  themeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  themeSwatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  themeItemTitle: {
    fontSize: 15,
  },
  themeItemDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  accentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 4,
  },
  accentButton: {
    alignItems: 'center',
    padding: 4,
    borderWidth: 2,
  },
  accentSwatch: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  resetAccentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 10,
  },
  resetAccentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionSubHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  radiusPill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  radiusPillText: {
    fontSize: 12,
  },
  previewContainer: {
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  previewBubbleAssistant: {
    padding: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  previewBubbleUser: {
    padding: 12,
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  previewBubbleText: {
    fontSize: 13,
    lineHeight: 18,
  },
  previewCenterPill: {
    alignItems: 'center',
    marginTop: 4,
  },
  previewScrollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  previewScrollButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  presetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  testButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginTop: 12,
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  modelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  modelRole: {
    fontSize: 13,
    fontWeight: '500',
  },
  modelName: {
    fontSize: 13,
    fontWeight: '700',
  },
});
