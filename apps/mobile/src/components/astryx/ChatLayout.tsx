// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx Design System - React Native Implementation
// Reference: https://astryx.atmeta.com/components/ChatLayout

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { ChatLayoutScrollButton } from './ChatLayoutScrollButton';

export interface ChatLayoutProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  composer?: React.ReactNode;
  scrollButtonVisible: boolean;
  scrollButtonLabel?: string;
  onScrollToBottom: () => void;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  header,
  children,
  composer,
  scrollButtonVisible,
  scrollButtonLabel,
  onScrollToBottom,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundBody }]}>
      {/* Header Slot */}
      {header ? (
        <View style={[styles.headerContainer, { borderBottomColor: colors.borderSubtle }]}>
          {header}
        </View>
      ) : null}

      {/* Main Message Area */}
      <View style={styles.bodyContainer}>
        {children}

        {/* Floating Dock: ChatLayoutScrollButton */}
        <ChatLayoutScrollButton
          isVisible={scrollButtonVisible}
          label={scrollButtonLabel}
          onClick={onScrollToBottom}
        />
      </View>

      {/* Composer Slot */}
      {composer ? <View style={styles.composerWrapper}>{composer}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerContainer: {
    borderBottomWidth: 1,
    zIndex: 5,
  },
  bodyContainer: {
    flex: 1,
    position: 'relative',
  },
  composerWrapper: {
    zIndex: 10,
  },
});
