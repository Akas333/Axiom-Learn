import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, ChatSession } from '../services/api';

export interface SessionsScreenProps {
  onSelectSession: (chatId: string) => void;
  onOpenSettings: () => void;
}

export const SessionsScreen: React.FC<SessionsScreenProps> = ({
  onSelectSession,
  onOpenSettings,
}) => {
  const { colors, radius, shadows } = useTheme();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [newTopic, setNewTopic] = useState<string>('');
  const [sessionKind, setSessionKind] = useState<'teach' | 'practice'>('teach');
  const [creating, setCreating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listChats();
      setSessions(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to backend server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSessions();
  };

  const handleCreateSession = async () => {
    if (!newTopic.trim() || creating) return;
    setCreating(true);
    try {
      const res = await api.createChat(newTopic.trim(), sessionKind);
      setModalVisible(false);
      setNewTopic('');
      await fetchSessions();
      onSelectSession(res.id);
    } catch (err: any) {
      setError(err?.message || 'Could not create session');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSession = async (id: string, e: any) => {
    e.stopPropagation?.();
    try {
      await api.deleteChat(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Failed to delete session');
    }
  };

  const renderSessionItem = ({ item }: { item: ChatSession }) => {
    return (
      <Pressable
        onPress={() => onSelectSession(item.id)}
        style={({ pressed }) => [
          styles.sessionCard,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.borderSubtle,
            borderRadius: radius.lg,
            opacity: pressed ? 0.92 : 1,
          },
          shadows.sm,
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconPill,
              {
                backgroundColor:
                  item.phase === 'practice'
                    ? colors.warningMuted
                    : colors.accentMuted,
                borderRadius: radius.md,
              },
            ]}
          >
            <Ionicons
              name={item.phase === 'practice' ? 'fitness-outline' : 'school-outline'}
              size={18}
              color={item.phase === 'practice' ? colors.warning : colors.accent}
            />
          </View>
          <View style={styles.titleArea}>
            <Text
              numberOfLines={1}
              style={[styles.sessionTitle, { color: colors.textPrimary }]}
            >
              {item.title || 'Untitled Session'}
            </Text>
            <Text style={[styles.sessionSubtitle, { color: colors.textSecondary }]}>
              {item.busy ? 'Turn in flight...' : 'Tap to continue lesson'}
            </Text>
          </View>
          <Pressable
            onPress={(e) => handleDeleteSession(item.id, e)}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={16} color={colors.textDisabled} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundBody }]}>
      {/* Top App Header */}
      <View
        style={[
          styles.appHeader,
          {
            backgroundColor: colors.backgroundSurface,
            borderBottomColor: colors.borderSubtle,
          },
        ]}
      >
        <View style={styles.branding}>
          <View
            style={[
              styles.logoBadge,
              { backgroundColor: colors.accent, borderRadius: radius.md },
            ]}
          >
            <Ionicons name="sparkles" size={16} color={colors.onAccent} />
          </View>
          <Text style={[styles.appName, { color: colors.textPrimary }]}>
            OptiMind
          </Text>
        </View>

        <Pressable onPress={onOpenSettings} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={20} color={colors.iconPrimary} />
        </Pressable>
      </View>

      {/* Main List Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading learning sessions...
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSessionItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={[styles.heading, { color: colors.textPrimary }]}>
                Your Learning Path
              </Text>
              <Text style={[styles.subheading, { color: colors.textSecondary }]}>
                Anchors on what you already know, teaches from where your understanding ends.
              </Text>

              {error ? (
                <View
                  style={[
                    styles.errorCard,
                    { backgroundColor: colors.errorMuted, borderRadius: radius.md },
                  ]}
                >
                  <Ionicons name="warning-outline" size={16} color={colors.error} />
                  <Text style={[styles.errorCardText, { color: colors.error }]}>
                    {error}
                  </Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View
                style={[
                  styles.emptyIconCircle,
                  { backgroundColor: colors.neutral, borderRadius: radius.full },
                ]}
              >
                <Ionicons name="book-outline" size={32} color={colors.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                No sessions yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Start your first interactive lesson with Meta's Muse model.
              </Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button (New Lesson) */}
      <View style={styles.fabWrapper}>
        <Pressable
          onPress={() => setModalVisible(true)}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.accent,
              borderRadius: radius.full,
              opacity: pressed ? 0.9 : 1,
            },
            shadows.lg,
          ]}
        >
          <Ionicons name="add" size={22} color={colors.onAccent} />
          <Text style={[styles.fabText, { color: colors.onAccent }]}>
            New Lesson
          </Text>
        </Pressable>
      </View>

      {/* Create Session Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.backgroundSurface,
                borderRadius: radius.xl,
              },
              shadows.lg,
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Start New Session
              </Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={20} color={colors.iconSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>
              What concept or question do you want to explore?
            </Text>

            <TextInput
              value={newTopic}
              onChangeText={setNewTopic}
              placeholder="e.g. Kirchhoff's Laws, Neural Backprop, Entropy..."
              placeholderTextColor={colors.textDisabled}
              style={[
                styles.modalInput,
                {
                  color: colors.textPrimary,
                  borderColor: colors.borderSubtle,
                  backgroundColor: colors.backgroundCard,
                  borderRadius: radius.md,
                },
              ]}
              autoFocus
            />

            {/* Kind Selector */}
            <View style={styles.kindSelectorRow}>
              <Pressable
                onPress={() => setSessionKind('teach')}
                style={[
                  styles.kindButton,
                  {
                    borderColor:
                      sessionKind === 'teach' ? colors.accent : colors.borderSubtle,
                    backgroundColor:
                      sessionKind === 'teach'
                        ? colors.accentMuted
                        : 'transparent',
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Ionicons
                  name="school-outline"
                  size={16}
                  color={
                    sessionKind === 'teach' ? colors.accent : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.kindButtonText,
                    {
                      color:
                        sessionKind === 'teach'
                          ? colors.accent
                          : colors.textSecondary,
                    },
                  ]}
                >
                  Teach Step-by-Step
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setSessionKind('practice')}
                style={[
                  styles.kindButton,
                  {
                    borderColor:
                      sessionKind === 'practice'
                        ? colors.warning
                        : colors.borderSubtle,
                    backgroundColor:
                      sessionKind === 'practice'
                        ? colors.warningMuted
                        : 'transparent',
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Ionicons
                  name="fitness-outline"
                  size={16}
                  color={
                    sessionKind === 'practice'
                      ? colors.warning
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.kindButtonText,
                    {
                      color:
                        sessionKind === 'practice'
                          ? colors.warning
                          : colors.textSecondary,
                    },
                  ]}
                >
                  Practice Recall
                </Text>
              </Pressable>
            </View>

            {/* Start Button */}
            <Pressable
              onPress={handleCreateSession}
              disabled={creating || !newTopic.trim()}
              style={({ pressed }) => [
                styles.startButton,
                {
                  backgroundColor: colors.accent,
                  borderRadius: radius.md,
                  opacity: creating || !newTopic.trim() ? 0.5 : pressed ? 0.9 : 1,
                },
              ]}
            >
              {creating ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Text style={[styles.startButtonText, { color: colors.onAccent }]}>
                  Begin Session
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  settingsButton: {
    padding: 6,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 90,
  },
  listHeader: {
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginTop: 12,
  },
  errorCardText: {
    fontSize: 12,
    flex: 1,
  },
  sessionCard: {
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconPill: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  titleArea: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sessionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 240,
    marginTop: 6,
  },
  fabWrapper: {
    position: 'absolute',
    bottom: 24,
    right: 20,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    gap: 8,
  },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  modalLabel: {
    fontSize: 13,
    marginBottom: 10,
  },
  modalInput: {
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  kindSelectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  kindButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1.5,
  },
  kindButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  startButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
