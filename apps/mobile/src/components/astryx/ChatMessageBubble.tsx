// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx Design System - React Native Implementation
// Reference: https://astryx.atmeta.com/components/ChatMessageBubble

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export interface ChatMessageBubbleProps {
  sender: 'user' | 'assistant' | 'system';
  children: React.ReactNode;
  variant?: 'filled' | 'ghost';
  time?: string;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  sender,
  children,
  variant = 'filled',
  time,
}) => {
  const { colors, radius, shadows } = useTheme();

  const isUser = sender === 'user';
  const isSystem = sender === 'system';

  const backgroundColor = isUser
    ? colors.bubbleUser
    : isSystem
    ? colors.bubbleSystem
    : colors.bubbleAssistant;

  const textColor = isUser
    ? colors.bubbleUserText
    : colors.bubbleAssistantText;

  const borderColor = isUser
    ? 'transparent'
    : isSystem
    ? colors.borderSubtle
    : colors.borderSubtle;

  return (
    <View
      style={[
        styles.bubble,
        {
          backgroundColor: variant === 'ghost' ? 'transparent' : backgroundColor,
          borderColor,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderRadius: radius.lg,
          borderBottomRightRadius: isUser ? radius.sm : radius.lg,
          borderBottomLeftRadius: isUser ? radius.lg : radius.sm,
        },
        !isUser && variant === 'filled' && shadows.sm,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.text, { color: textColor }]}>{children}</Text>
      ) : (
        children
      )}
      {time ? (
        <Text
          style={[
            styles.timeText,
            { color: isUser ? 'rgba(255,255,255,0.65)' : colors.textSecondary },
          ]}
        >
          {time}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '88%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 4,
  },
  text: {
    fontSize: 14.5,
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});
