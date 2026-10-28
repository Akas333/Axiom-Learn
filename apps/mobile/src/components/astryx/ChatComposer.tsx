// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx Design System - React Native Implementation
// Reference: https://astryx.atmeta.com/components/ChatComposer

import React, { useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

export interface ChatComposerProps {
  onSend: (text: string, thinking?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  thinkingMode?: boolean;
  onToggleThinking?: () => void;
  showThinkingInput?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  disabled = false,
  placeholder = 'Ask, answer, or steer the lesson…',
  thinkingMode = false,
  onToggleThinking,
  showThinkingInput = false,
}) => {
  const { colors, radius, shadows } = useTheme();
  const [text, setText] = useState('');
  const [thinkingText, setThinkingText] = useState('');
  const [isDictating, setIsDictating] = useState(false);

  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim(), thinkingText.trim() ? thinkingText.trim() : undefined);
    setText('');
    setThinkingText('');
    Keyboard.dismiss();
  };

  const handleToggleDictation = () => {
    setIsDictating((prev) => !prev);
    if (!isDictating && text.length === 0) {
      setText('Explain how this connects to what I already learned.');
    }
  };

  return (
    <View style={styles.outerWrapper}>
      {/* Optional "Think out loud" dock (Astryx thinking field) */}
      {showThinkingInput ? (
        <View
          style={[
            styles.thinkingDock,
            {
              backgroundColor: colors.backgroundSurface,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.thinkingHeader}>
            <View style={styles.thinkingBadge}>
              <Ionicons name="bulb-outline" size={13} color={colors.warning} />
              <Text style={[styles.thinkingBadgeText, { color: colors.warning }]}>
                Think Out Loud
              </Text>
            </View>
            <Text style={[styles.thinkingSubtext, { color: colors.textSecondary }]}>
              Type or dictate your doubts & internal reasoning
            </Text>
          </View>
          <TextInput
            value={thinkingText}
            onChangeText={setThinkingText}
            placeholder="What is your thinking or confusion right now?"
            placeholderTextColor={colors.textDisabled}
            style={[styles.thinkingInput, { color: colors.textPrimary }]}
            multiline
            maxLength={500}
          />
        </View>
      ) : null}

      {/* Main Astryx Pill Shell */}
      <View
        style={[
          styles.composerShell,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.borderStrong,
            borderRadius: radius.xl,
          },
          shadows.med,
        ]}
      >
        {/* Leading Sparkle / Think Toggle */}
        {onToggleThinking ? (
          <Pressable
            onPress={onToggleThinking}
            style={({ pressed }) => [
              styles.leadingAction,
              {
                backgroundColor: thinkingMode
                  ? colors.accentMuted
                  : 'transparent',
                borderRadius: radius.md,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Ionicons
              name={thinkingMode ? 'bulb' : 'bulb-outline'}
              size={18}
              color={thinkingMode ? colors.warning : colors.iconSecondary}
            />
          </Pressable>
        ) : null}

        {/* Text Input */}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDisabled}
          style={[styles.input, { color: colors.textPrimary }]}
          multiline
          maxLength={1000}
          editable={!disabled}
        />

        {/* Dictation Mic Button */}
        <Pressable
          onPress={handleToggleDictation}
          style={({ pressed }) => [
            styles.trailingAction,
            { opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Ionicons
            name={isDictating ? 'mic' : 'mic-outline'}
            size={19}
            color={isDictating ? colors.error : colors.iconSecondary}
          />
        </Pressable>

        {/* Circular Send Button (Astryx Send Button) */}
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: canSend ? colors.accent : colors.neutral,
              borderRadius: radius.full,
              opacity: canSend && pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons
            name="arrow-up"
            size={16}
            color={canSend ? colors.onAccent : colors.textDisabled}
          />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  thinkingDock: {
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
  },
  thinkingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  thinkingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  thinkingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  thinkingSubtext: {
    fontSize: 10,
  },
  thinkingInput: {
    fontSize: 13,
    minHeight: 36,
    paddingVertical: 2,
    lineHeight: 18,
  },
  composerShell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    minHeight: 48,
  },
  leadingAction: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 14,
    maxHeight: 100,
    minHeight: 32,
    paddingHorizontal: 6,
    paddingVertical: 4,
    letterSpacing: -0.1,
  },
  trailingAction: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  sendButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
