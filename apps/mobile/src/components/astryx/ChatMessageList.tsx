// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx Design System - React Native Implementation
// Reference: https://astryx.atmeta.com/components/ChatMessageList

import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export interface ChatMessageListHandles {
  scrollToBottom: (animated?: boolean) => void;
}

export interface ChatMessageListProps {
  data: any[];
  renderItem: ({ item, index }: { item: any; index: number }) => React.ReactElement | null;
  keyExtractor?: (item: any, index: number) => string;
  onScrollStateChange?: (state: { isAtBottom: boolean; hasUnread: boolean }) => void;
  ListHeaderComponent?: React.JSX.Element | React.ComponentType<any>;
  ListFooterComponent?: React.JSX.Element | React.ComponentType<any>;
  ListEmptyComponent?: React.JSX.Element | React.ComponentType<any>;
}

export const ChatMessageList = forwardRef<ChatMessageListHandles, ChatMessageListProps>(
  (
    {
      data,
      renderItem,
      keyExtractor = (item, index) => item.id || String(index),
      onScrollStateChange,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
    },
    ref
  ) => {
    const { colors } = useTheme();
    const flatListRef = useRef<FlatList>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [hasUnread, setHasUnread] = useState(false);
    const prevDataLength = useRef(data.length);

    // Scroll-to-bottom imperative handle
    useImperativeHandle(ref, () => ({
      scrollToBottom: (animated = true) => {
        flatListRef.current?.scrollToEnd({ animated });
        setIsAtBottom(true);
        setHasUnread(false);
        onScrollStateChange?.({ isAtBottom: true, hasUnread: false });
      },
    }));

    // Detect if new items arrived while scrolled up
    useEffect(() => {
      if (data.length > prevDataLength.current) {
        if (!isAtBottom) {
          setHasUnread(true);
          onScrollStateChange?.({ isAtBottom: false, hasUnread: true });
        } else {
          // If already at bottom, auto-scroll to the new message
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 60);
        }
      }
      prevDataLength.current = data.length;
    }, [data.length, isAtBottom, onScrollStateChange]);

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;

      const atBottom = distanceFromBottom < 60;
      if (atBottom !== isAtBottom) {
        setIsAtBottom(atBottom);
        const unread = atBottom ? false : hasUnread;
        if (atBottom) setHasUnread(false);
        onScrollStateChange?.({ isAtBottom: atBottom, hasUnread: unread });
      }
    };

    return (
      <View style={[styles.container, { backgroundColor: colors.backgroundBody }]}>
        <FlatList
          ref={flatListRef}
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooterComponent}
          ListEmptyComponent={ListEmptyComponent}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 12,
    flexGrow: 1,
  },
});
