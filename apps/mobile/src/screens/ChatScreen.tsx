import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, ChatMessageItem } from '../services/api';
import { ChatLayout } from '../components/astryx/ChatLayout';
import {
  ChatMessageList,
  ChatMessageListHandles,
} from '../components/astryx/ChatMessageList';
import { ChatMessage } from '../components/astryx/ChatMessage';
import { ChatMessageBubble } from '../components/astryx/ChatMessageBubble';
import { ChatComposer } from '../components/astryx/ChatComposer';
import { QuestionCard } from '../components/cards/QuestionCard';

export interface ChatScreenProps {
  chatId: string;
  onOpenDrawer: () => void;
  onNewSession: () => void;
  onOpenSettings?: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  chatId,
  onOpenDrawer,
  onNewSession,
  onOpenSettings,
}) => {
  const { colors, radius, shadows } = useTheme();
  const listRef = useRef<ChatMessageListHandles>(null);

  const [sessionTitle, setSessionTitle] = useState('AI Tutoring Session');
  const [phase, setPhase] = useState<string>('teach');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Astryx ChatLayoutScrollButton state
  const [scrollButtonVisible, setScrollButtonVisible] = useState(false);
  const [scrollButtonLabel, setScrollButtonLabel] = useState<string | undefined>(
    undefined
  );

  // Think Out Loud mode
  const [thinkingMode, setThinkingMode] = useState(false);

  // Fetch session data
  const loadChat = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getChat(chatId);
      setSessionTitle(data.title || 'Tutoring Session');
      if ((data as any).phase) setPhase((data as any).phase);

      const rawMessages = data.messages || [];
      const parsed: ChatMessageItem[] = rawMessages
        .map((m: any, idx: number): ChatMessageItem => {
          const role: 'user' | 'assistant' | 'system' =
            m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant';
          let content = '';
          let questionData: any = null;

          if (typeof m.content === 'string') {
            const trimmed = m.content.trim();
            if (trimmed.startsWith('{') && trimmed.includes('"kind"')) {
              try {
                const parsedJson = JSON.parse(trimmed);
                if (parsedJson.kind === 'ask' && Array.isArray(parsedJson.answers)) {
                  content = parsedJson.answers.map((a: any) => a.label || a.text || `Choice: ${a.index}`).join('\n');
                } else if (parsedJson.text || parsedJson.message) {
                  content = parsedJson.text || parsedJson.message;
                } else {
                  content = trimmed;
                }
              } catch {
                content = trimmed;
              }
            } else {
              content = m.content;
            }
          } else if (Array.isArray(m.content)) {
            for (const part of m.content) {
              if (part.type === 'text') {
                content += (part.text || '') + '\n';
              } else if (part.type === 'tool-call') {
                if (
                  part.toolName === 'ask_question' ||
                  part.toolName?.includes('question')
                ) {
                  questionData = {
                    toolCallId: part.toolCallId || String(idx),
                    tool: part.toolName,
                    question:
                      part.args?.question || part.args?.statement || 'Question',
                    options: part.args?.options || [],
                  };
                }
              }
            }
          }

          return {
            id: m.id || String(idx),
            role,
            content: content.trim(),
            question: questionData,
            timestamp: m.timestamp || Date.now(),
          };
        })
        .filter((m: ChatMessageItem) => Boolean(m.content || m.question));

      // Friendly fallback if empty
      if (parsed.length === 0) {
        parsed.push({
          id: 'welcome',
          role: 'assistant',
          content: `Welcome to Kapany! I measure what you already understand, plan a path to your goal, and teach one step at a time.\n\nAsk any question or explain a concept to get started.`,
          timestamp: Date.now(),
        });
      }

      setMessages(parsed);
    } catch (err: any) {
      setError(err?.message || 'Failed to load chat history');
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadChat();
    const interval = setInterval(loadChat, 4000);
    return () => clearInterval(interval);
  }, [loadChat]);

  // Scroll state updates from ChatMessageList
  const handleScrollStateChange = ({
    isAtBottom,
    hasUnread,
  }: {
    isAtBottom: boolean;
    hasUnread: boolean;
  }) => {
    setScrollButtonVisible(!isAtBottom);
    setScrollButtonLabel(hasUnread ? 'New messages' : undefined);
  };

  // Triggered by ChatLayoutScrollButton
  const handleScrollToBottom = () => {
    listRef.current?.scrollToBottom(true);
    setScrollButtonVisible(false);
    setScrollButtonLabel(undefined);
  };

  // Send message
  const handleSend = async (text: string, thinking?: string) => {
    if (!text.trim() || sending) return;

    const tempUserMsg: ChatMessageItem = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      thinking,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setSending(true);

    try {
      await api.sendChatInput(chatId, {
        type: 'text',
        text,
      });
      await loadChat();
      setTimeout(handleScrollToBottom, 120);
    } catch (err: any) {
      setError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // Answer question
  const handleAnswerQuestion = async (answer: {
    toolCallId: string;
    choice?: string;
    confidence: number;
    thinking?: string;
  }) => {
    setSending(true);
    try {
      await api.sendChatInput(chatId, {
        type: 'answer',
        toolCallId: answer.toolCallId,
        answer: {
          choice: answer.choice,
          confidence: answer.confidence,
          thinking: answer.thinking,
        },
      });
      await loadChat();
      setTimeout(handleScrollToBottom, 120);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit answer');
    } finally {
      setSending(false);
    }
  };

  // Render individual item
  const renderMessageItem = ({ item }: { item: ChatMessageItem }) => {
    return (
      <ChatMessage
        sender={item.role}
        senderName={
          item.role === 'assistant'
            ? 'Muse Spark'
            : item.role === 'user'
            ? 'You'
            : undefined
        }
      >
        {item.content ? (
          <ChatMessageBubble sender={item.role}>
            {item.content}
          </ChatMessageBubble>
        ) : null}

        {item.question ? (
          <QuestionCard
            data={item.question}
            onSubmit={handleAnswerQuestion}
            disabled={sending}
          />
        ) : null}
      </ChatMessage>
    );
  };

  // Astryx TopBar Header
  const headerComponent = (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: colors.backgroundSurface,
          borderBottomColor: colors.borderSubtle,
        },
      ]}
    >
      <Pressable onPress={onOpenDrawer} style={styles.iconButton}>
        <Ionicons name="menu-outline" size={22} color={colors.iconPrimary} />
      </Pressable>

      <View style={styles.titleArea}>
        <Text
          numberOfLines={1}
          style={[styles.sessionTitle, { color: colors.textPrimary }]}
        >
          {sessionTitle}
        </Text>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.modelPill,
              { backgroundColor: colors.accentMuted, borderRadius: radius.sm },
            ]}
          >
            <Ionicons name="sparkles" size={10} color={colors.accent} />
            <Text style={[styles.modelText, { color: colors.accent }]}>
              Muse Spark 1.3
            </Text>
          </View>
          <Text style={[styles.phaseText, { color: colors.textSecondary }]}>
            • {phase === 'practice' ? 'Practice' : 'Step-by-step Teaching'}
          </Text>
        </View>
      </View>

      <View style={styles.headerActions}>
        <Pressable onPress={onNewSession} style={styles.iconButton}>
          <Ionicons name="add" size={22} color={colors.iconPrimary} />
        </Pressable>
        {onOpenSettings && (
          <Pressable onPress={onOpenSettings} style={styles.iconButton}>
            <Ionicons name="settings-outline" size={20} color={colors.iconSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <ChatLayout
      header={headerComponent}
      scrollButtonVisible={scrollButtonVisible}
      scrollButtonLabel={scrollButtonLabel}
      onScrollToBottom={handleScrollToBottom}
      composer={
        <ChatComposer
          onSend={handleSend}
          disabled={sending}
          thinkingMode={thinkingMode}
          onToggleThinking={() => setThinkingMode(!thinkingMode)}
          showThinkingInput={thinkingMode}
        />
      }
    >
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Attaching to tutor session...
          </Text>
        </View>
      ) : (
        <>
          {error ? (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: colors.errorMuted, borderRadius: radius.md },
              ]}
            >
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>
            </View>
          ) : null}

          <ChatMessageList
            ref={listRef}
            data={messages}
            renderItem={renderMessageItem}
            keyExtractor={(item) => item.id}
            onScrollStateChange={handleScrollStateChange}
          />
        </>
      )}
    </ChatLayout>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconButton: {
    padding: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  titleArea: {
    flex: 1,
    marginHorizontal: 8,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  modelText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  phaseText: {
    fontSize: 11,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 10,
    padding: 8,
    gap: 6,
  },
  errorText: {
    fontSize: 12,
    flex: 1,
  },
});
