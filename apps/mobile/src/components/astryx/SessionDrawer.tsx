// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx Design System - Session Drawer

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { ChatSession } from '../../services/api';

export interface SessionDrawerProps {
  visible: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeChatId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onOpenGraph: () => void;
  onOpenReview: () => void;
  onOpenSettings: () => void;
}

export const SessionDrawer: React.FC<SessionDrawerProps> = ({
  visible,
  onClose,
  sessions,
  activeChatId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenGraph,
  onOpenReview,
  onOpenSettings,
}) => {
  const { colors, radius, shadows } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Drawer Content */}
        <View
          style={[
            styles.drawerContent,
            {
              backgroundColor: colors.backgroundSurface,
              borderRightColor: colors.borderSubtle,
            },
            shadows.lg,
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <View style={styles.brandRow}>
              <View
                style={[
                  styles.logoCircle,
                  { backgroundColor: colors.accent, borderRadius: radius.full },
                ]}
              >
                <Ionicons name="sparkles" size={14} color={colors.onAccent} />
              </View>
              <Text style={[styles.brandText, { color: colors.textPrimary }]}>
                OptiMind
              </Text>
            </View>

            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.iconSecondary} />
            </Pressable>
          </View>

          {/* New Session Button */}
          <View style={styles.newActionWrapper}>
            <Pressable
              onPress={() => {
                onClose();
                onNewSession();
              }}
              style={({ pressed }) => [
                styles.newButton,
                {
                  backgroundColor: colors.backgroundCard,
                  borderColor: colors.borderStrong,
                  borderRadius: radius.md,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={18} color={colors.accent} />
              <Text style={[styles.newButtonText, { color: colors.textPrimary }]}>
                New Session
              </Text>
            </Pressable>
          </View>

          {/* Sessions List */}
          <ScrollView contentContainerStyle={styles.listContent}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Sessions ({sessions.length})
            </Text>

            {sessions.map((s) => {
              const isActive = s.id === activeChatId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    onSelectSession(s.id);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.sessionRow,
                    {
                      backgroundColor: isActive
                        ? colors.accentMuted
                        : pressed
                        ? colors.neutral
                        : 'transparent',
                      borderColor: isActive
                        ? colors.accent
                        : 'transparent',
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      s.phase === 'practice'
                        ? 'fitness-outline'
                        : 'chatbubble-ellipses-outline'
                    }
                    size={16}
                    color={isActive ? colors.accent : colors.iconSecondary}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sessionTitle,
                      {
                        color: isActive
                          ? colors.textAccent
                          : colors.textPrimary,
                        fontWeight: isActive ? '700' : '500',
                      },
                    ]}
                  >
                    {s.title || 'Untitled Session'}
                  </Text>
                  <Pressable
                    onPress={() => onDeleteSession(s.id)}
                    style={styles.deleteBtn}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={14}
                      color={colors.textDisabled}
                    />
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Drawer Footer Tools */}
          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
            <Pressable
              onPress={() => {
                onClose();
                onOpenGraph();
              }}
              style={styles.footerRow}
            >
              <Ionicons name="git-network-outline" size={18} color={colors.iconSecondary} />
              <Text style={[styles.footerText, { color: colors.textPrimary }]}>
                Knowledge Graph
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                onClose();
                onOpenReview();
              }}
              style={styles.footerRow}
            >
              <Ionicons name="fitness-outline" size={18} color={colors.iconSecondary} />
              <Text style={[styles.footerText, { color: colors.textPrimary }]}>
                Daily Practice / Flashcards
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                onClose();
                onOpenSettings();
              }}
              style={styles.footerRow}
            >
              <Ionicons name="settings-outline" size={18} color={colors.iconSecondary} />
              <Text style={[styles.footerText, { color: colors.textPrimary }]}>
                Settings
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  drawerContent: {
    width: '82%',
    maxWidth: 320,
    height: '100%',
    borderRightWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoCircle: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  closeBtn: {
    padding: 4,
  },
  newActionWrapper: {
    padding: 12,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
  },
  newButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 4,
    borderWidth: 1,
  },
  sessionTitle: {
    fontSize: 13.5,
    flex: 1,
  },
  deleteBtn: {
    padding: 4,
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    gap: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 10,
  },
  footerText: {
    fontSize: 13.5,
    fontWeight: '500',
  },
});
