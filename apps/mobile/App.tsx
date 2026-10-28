import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme } from './src/theme/ThemeContext';
import { themes, defaultThemeSlug } from './src/astryx-themes';
import { api, ChatSession } from './src/services/api';
import { ChatScreen } from './src/screens/ChatScreen';
import { GraphScreen } from './src/screens/GraphScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SessionDrawer } from './src/components/astryx/SessionDrawer';

const MainApp: React.FC = () => {
  const { colors, isDark, radius, shadows } = useTheme();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Overlay screens
  const [showGraph, setShowGraph] = useState<boolean>(false);
  const [showReview, setShowReview] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // New session modal
  const [newSessionModal, setNewSessionModal] = useState<boolean>(false);
  const [topic, setTopic] = useState<string>('');
  const [sessionKind, setSessionKind] = useState<'teach' | 'practice'>('teach');
  const [creating, setCreating] = useState<boolean>(false);

  // Fetch sessions on startup
  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.listChats();
      setSessions(data);
      if (data.length > 0 && !activeChatId) {
        // Automatically open the most recent session
        setActiveChatId(data[0].id);
      }
    } catch {
      // Backend not yet connected
    } finally {
      setLoading(false);
    }
  }, [activeChatId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleCreateSession = async () => {
    if (!topic.trim() || creating) return;
    setCreating(true);
    try {
      const res = await api.createChat(topic.trim(), sessionKind);
      setNewSessionModal(false);
      setTopic('');
      await fetchSessions();
      setActiveChatId(res.id);
    } catch (err: any) {
      alert(err?.message || 'Could not create session');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteChat(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeChatId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch {
      // Ignore
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.backgroundBody }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Main Viewport */}
      {showSettings ? (
        <SettingsScreen onClose={() => setShowSettings(false)} />
      ) : showGraph ? (
        <View style={styles.flexOne}>
          <View style={[styles.subHeader, { backgroundColor: colors.backgroundSurface, borderBottomColor: colors.borderSubtle }]}>
            <Pressable onPress={() => setShowGraph(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.iconPrimary} />
            </Pressable>
            <Text style={[styles.subHeaderTitle, { color: colors.textPrimary }]}>
              Knowledge Graph
            </Text>
          </View>
          <GraphScreen />
        </View>
      ) : showReview ? (
        <View style={styles.flexOne}>
          <View style={[styles.subHeader, { backgroundColor: colors.backgroundSurface, borderBottomColor: colors.borderSubtle }]}>
            <Pressable onPress={() => setShowReview(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.iconPrimary} />
            </Pressable>
            <Text style={[styles.subHeaderTitle, { color: colors.textPrimary }]}>
              Practice Recall
            </Text>
          </View>
          <ReviewScreen />
        </View>
      ) : activeChatId ? (
        <ChatScreen
          chatId={activeChatId}
          onOpenDrawer={() => setDrawerOpen(true)}
          onNewSession={() => setNewSessionModal(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
      ) : (
        /* Astryx Zero-State AI Landing */
        <View style={[styles.emptyContainer, { backgroundColor: colors.backgroundBody }]}>
          <View style={[styles.topBarEmpty, { borderBottomColor: colors.borderSubtle }]}>
            <Pressable onPress={() => setDrawerOpen(true)} style={styles.backBtn}>
              <Ionicons name="menu-outline" size={24} color={colors.iconPrimary} />
            </Pressable>
            <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>
              OptiMind
            </Text>
            <Pressable onPress={() => setShowSettings(true)} style={styles.backBtn}>
              <Ionicons name="settings-outline" size={20} color={colors.iconSecondary} />
            </Pressable>
          </View>

          <View style={styles.heroCenter}>
            <View
              style={[
                styles.sparkleIconWrapper,
                { backgroundColor: colors.accentMuted, borderRadius: radius.full },
              ]}
            >
              <Ionicons name="sparkles" size={32} color={colors.accent} />
            </View>
            <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
              What do you want to learn?
            </Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              Kapany finds where your understanding ends and teaches from there.
            </Text>

            <Pressable
              onPress={() => setNewSessionModal(true)}
              style={({ pressed }) => [
                styles.primaryNewBtn,
                {
                  backgroundColor: colors.accent,
                  borderRadius: radius.full,
                  opacity: pressed ? 0.9 : 1,
                },
                shadows.med,
              ]}
            >
              <Ionicons name="add" size={20} color={colors.onAccent} />
              <Text style={[styles.primaryNewBtnText, { color: colors.onAccent }]}>
                Start a New Lesson
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Astryx Session Drawer */}
      <SessionDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sessions={sessions}
        activeChatId={activeChatId}
        onSelectSession={(id) => {
          setActiveChatId(id);
          setShowGraph(false);
          setShowReview(false);
          setShowSettings(false);
        }}
        onNewSession={() => setNewSessionModal(true)}
        onDeleteSession={handleDeleteSession}
        onOpenGraph={() => setShowGraph(true)}
        onOpenReview={() => setShowReview(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Create New Session Modal */}
      <Modal
        visible={newSessionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setNewSessionModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.backgroundSurface,
                borderColor: colors.borderSubtle,
                borderRadius: radius.xl,
              },
              shadows.lg,
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalHeading, { color: colors.textPrimary }]}>
                New Session
              </Text>
              <Pressable
                onPress={() => setNewSessionModal(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.iconSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              What concept, problem or skill would you like to master?
            </Text>

            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Kirchhoff's Laws, Dynamic Programming, Entropy..."
              placeholderTextColor={colors.textDisabled}
              style={[
                styles.modalTextInput,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.backgroundCard,
                  borderColor: colors.borderStrong,
                  borderRadius: radius.md,
                },
              ]}
              autoFocus
            />

            {/* Mode Selector */}
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setSessionKind('teach')}
                style={[
                  styles.modePill,
                  {
                    backgroundColor:
                      sessionKind === 'teach'
                        ? colors.accentMuted
                        : 'transparent',
                    borderColor:
                      sessionKind === 'teach'
                        ? colors.accent
                        : colors.borderSubtle,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Ionicons
                  name="school-outline"
                  size={15}
                  color={
                    sessionKind === 'teach' ? colors.accent : colors.iconSecondary
                  }
                />
                <Text
                  style={[
                    styles.modeText,
                    {
                      color:
                        sessionKind === 'teach'
                          ? colors.accent
                          : colors.textSecondary,
                    },
                  ]}
                >
                  Step-by-Step
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setSessionKind('practice')}
                style={[
                  styles.modePill,
                  {
                    backgroundColor:
                      sessionKind === 'practice'
                        ? colors.warningMuted
                        : 'transparent',
                    borderColor:
                      sessionKind === 'practice'
                        ? colors.warning
                        : colors.borderSubtle,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Ionicons
                  name="fitness-outline"
                  size={15}
                  color={
                    sessionKind === 'practice'
                      ? colors.warning
                      : colors.iconSecondary
                  }
                />
                <Text
                  style={[
                    styles.modeText,
                    {
                      color:
                        sessionKind === 'practice'
                          ? colors.warning
                          : colors.textSecondary,
                    },
                  ]}
                >
                  Recall Practice
                </Text>
              </Pressable>
            </View>

            {/* Launch Button */}
            <Pressable
              onPress={handleCreateSession}
              disabled={creating || !topic.trim()}
              style={({ pressed }) => [
                styles.launchBtn,
                {
                  backgroundColor: colors.accent,
                  borderRadius: radius.md,
                  opacity: creating || !topic.trim() ? 0.5 : pressed ? 0.88 : 1,
                },
              ]}
            >
              {creating ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Text style={[styles.launchBtnText, { color: colors.onAccent }]}>
                  Start Lesson
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <Theme theme={themes[defaultThemeSlug]}>
        <MainApp />
      </Theme>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flexOne: {
    flex: 1,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: {
    padding: 6,
  },
  subHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
  },
  topBarEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  sparkleIconWrapper: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroHeading: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    gap: 8,
  },
  primaryNewBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderWidth: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalDesc: {
    fontSize: 13,
    marginBottom: 14,
  },
  modalTextInput: {
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    gap: 6,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  launchBtn: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
