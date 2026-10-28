// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx Design System - React Native Implementation
// Reference: https://astryx.atmeta.com/components/ChatMessage

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

export interface ChatMessageProps {
  sender: 'user' | 'assistant' | 'system';
  senderName?: string;
  avatar?: string;
  children: React.ReactNode;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  sender,
  senderName,
  children,
}) => {
  const { colors, radius } = useTheme();
  const isUser = sender === 'user';
  const isSystem = sender === 'system';

  if (isSystem) {
    return <View style={styles.systemContainer}>{children}</View>;
  }

  return (
    <View
      style={[
        styles.messageContainer,
        isUser ? styles.alignUser : styles.alignAssistant,
      ]}
    >
      <View style={[styles.innerRow, isUser ? styles.rowReverse : styles.rowNormal]}>
        {/* Avatar */}
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: isUser ? colors.accent : colors.neutral,
              borderRadius: radius.full,
            },
          ]}
        >
          <Ionicons
            name={isUser ? 'person' : 'sparkles'}
            size={14}
            color={isUser ? colors.onAccent : colors.accent}
          />
        </View>

        {/* Message and Sender metadata */}
        <View style={[styles.contentColumn, isUser ? styles.alignEnd : styles.alignStart]}>
          {senderName ? (
            <Text
              style={[
                styles.senderName,
                { color: colors.textSecondary },
                isUser ? styles.textRight : styles.textLeft,
              ]}
            >
              {senderName}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    marginVertical: 4,
    paddingHorizontal: 16,
    width: '100%',
  },
  systemContainer: {
    marginVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
  },
  alignUser: {
    alignItems: 'flex-end',
  },
  alignAssistant: {
    alignItems: 'flex-start',
  },
  innerRow: {
    flexDirection: 'row',
    maxWidth: '92%',
  },
  rowNormal: {
    flexDirection: 'row',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginHorizontal: 8,
  },
  contentColumn: {
    flexShrink: 1,
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    marginHorizontal: 4,
  },
  textLeft: {
    textAlign: 'left',
  },
  textRight: {
    textAlign: 'right',
  },
});
