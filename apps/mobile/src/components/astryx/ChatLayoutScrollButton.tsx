// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx Design System - React Native Implementation
// Reference: https://astryx.atmeta.com/components/ChatLayoutScrollButton

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

export interface ChatLayoutScrollButtonProps {
  /**
   * Whether the button is visible. Bind to scroll position check
   * so the button only appears when the user has scrolled up away from bottom.
   */
  isVisible: boolean;
  /**
   * Optional label that expands the button (e.g. "New messages").
   * Used to signal unread content below the fold.
   */
  label?: string;
  /**
   * Click / press handler: typically scrolls to bottom and dismisses new message indicator.
   */
  onClick: () => void;
}

/**
 * Floating scroll-to-bottom button for use inside ChatLayout.
 * Appears when the user scrolls away from the latest messages.
 * Fades in as a compact icon button and expands to show a label when new messages arrive.
 */
export const ChatLayoutScrollButton: React.FC<ChatLayoutScrollButtonProps> = ({
  isVisible,
  label,
  onClick,
}) => {
  const { colors, radius, shadows } = useTheme();

  const animOpacity = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const animTranslateY = useRef(new Animated.Value(isVisible ? 0 : 10)).current;
  const animWidth = useRef(new Animated.Value(label ? 1 : 0)).current;

  // Fade and slide animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(animOpacity, {
        toValue: isVisible ? 1 : 0,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(animTranslateY, {
        toValue: isVisible ? 0 : 10,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isVisible, animOpacity, animTranslateY]);

  // Label expansion animation
  useEffect(() => {
    Animated.spring(animWidth, {
      toValue: label ? 1 : 0,
      friction: 8,
      tension: 70,
      useNativeDriver: false,
    }).start();
  }, [label, animWidth]);

  return (
    <View
      style={styles.dockWrapper}
      pointerEvents={isVisible ? 'box-none' : 'none'}
    >
      <Animated.View
        style={[
          styles.animatedContainer,
          {
            opacity: animOpacity,
            transform: [{ translateY: animTranslateY }],
          },
        ]}
      >
        <Pressable
          onPress={onClick}
          accessibilityRole="button"
          accessibilityLabel={label || 'Scroll to bottom'}
          accessibilityHint="Scrolls the chat to the latest message"
          style={({ pressed }) => [
            styles.pill,
            {
              backgroundColor: colors.backgroundPopover,
              borderColor: colors.borderStrong,
              borderRadius: radius.full,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
            shadows.med,
          ]}
        >
          <View style={styles.contentRow}>
            {/* Chevron Icon */}
            <View style={styles.iconContainer}>
              <Ionicons
                name="chevron-down"
                size={16}
                color={label ? colors.accent : colors.iconPrimary}
              />
            </View>

            {/* Expandable Label */}
            {label ? (
              <Animated.View
                style={[
                  styles.labelContainer,
                  {
                    opacity: animWidth,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.labelText,
                    {
                      color: colors.textPrimary,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  dockWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  animatedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    marginLeft: 6,
    paddingRight: 4,
  },
  labelText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
