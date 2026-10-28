import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, ReviewItem } from '../services/api';

export const ReviewScreen: React.FC = () => {
  const { colors, radius, shadows } = useTheme();

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getReview();
      const raw = res.items || [];
      if (raw.length === 0) {
        // Fallback sample review cards if none are due yet
        setItems([
          {
            id: 'sample-1',
            nodeId: 'kcl',
            front: "Kirchhoff's Current Law (KCL)",
            back: 'The algebraic sum of currents entering a junction or node in an electric circuit equals the sum of currents leaving the junction. Charge cannot vanish.',
          },
          {
            id: 'sample-2',
            nodeId: 'kvl',
            front: "Kirchhoff's Voltage Law (KVL)",
            back: 'The directed sum of potential differences (voltages) around any closed loop is zero. Energy is conserved.',
          },
        ]);
      } else {
        setItems(raw);
      }
      setCurrentIndex(0);
      setRevealed(false);
    } catch {
      // Offline fallback
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleNext = () => {
    setRevealed(false);
    if (currentIndex < items.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentIndex(items.length);
    }
  };

  const currentItem = items[currentIndex];

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundBody }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.backgroundSurface,
            borderBottomColor: colors.borderSubtle,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Daily Practice & Recall
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Spaced repetition cards drawn from your active knowledge graph
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : currentIndex >= items.length ? (
        <View style={styles.completedContainer}>
          <Ionicons name="ribbon-outline" size={54} color={colors.success} />
          <Text style={[styles.completedTitle, { color: colors.textPrimary }]}>
            All caught up!
          </Text>
          <Text style={[styles.completedDesc, { color: colors.textSecondary }]}>
            You have reviewed all due cards for today. Return to teaching sessions to add more claims.
          </Text>
          <Pressable
            onPress={fetchReviews}
            style={[
              styles.restartButton,
              { backgroundColor: colors.accent, borderRadius: radius.md },
            ]}
          >
            <Text style={[styles.restartButtonText, { color: colors.onAccent }]}>
              Review Again
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cardArea}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              Card {currentIndex + 1} of {items.length}
            </Text>
          </View>

          {/* Flashcard */}
          <Pressable
            onPress={() => setRevealed(!revealed)}
            style={({ pressed }) => [
              styles.flashcard,
              {
                backgroundColor: colors.backgroundCard,
                borderColor: colors.borderSubtle,
                borderRadius: radius.xl,
                opacity: pressed ? 0.96 : 1,
              },
              shadows.med,
            ]}
          >
            <View style={styles.cardBadge}>
              <Text style={[styles.cardBadgeText, { color: colors.accent }]}>
                {revealed ? 'ANSWER / CLAIM' : 'QUESTION / PROMPT'}
              </Text>
            </View>

            <Text style={[styles.cardContent, { color: colors.textPrimary }]}>
              {revealed ? currentItem.back : currentItem.front}
            </Text>

            <Text style={[styles.tapHint, { color: colors.textDisabled }]}>
              {revealed ? 'Tap to hide answer' : 'Tap to reveal answer'}
            </Text>
          </Pressable>

          {/* Action Row */}
          {revealed ? (
            <View style={styles.responseRow}>
              <Pressable
                onPress={handleNext}
                style={[
                  styles.gradeButton,
                  { backgroundColor: colors.errorMuted, borderRadius: radius.md },
                ]}
              >
                <Text style={[styles.gradeText, { color: colors.error }]}>
                  Hard
                </Text>
              </Pressable>
              <Pressable
                onPress={handleNext}
                style={[
                  styles.gradeButton,
                  { backgroundColor: colors.warningMuted, borderRadius: radius.md },
                ]}
              >
                <Text style={[styles.gradeText, { color: colors.warning }]}>
                  Good
                </Text>
              </Pressable>
              <Pressable
                onPress={handleNext}
                style={[
                  styles.gradeButton,
                  { backgroundColor: colors.successMuted, borderRadius: radius.md },
                ]}
              >
                <Text style={[styles.gradeText, { color: colors.success }]}>
                  Easy
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardArea: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  progressRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
  },
  flashcard: {
    minHeight: 260,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBadge: {
    alignSelf: 'flex-start',
  },
  cardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardContent: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 26,
    marginVertical: 20,
  },
  tapHint: {
    fontSize: 12,
  },
  responseRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  gradeButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  completedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 12,
  },
  completedTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  completedDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  restartButton: {
    marginTop: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  restartButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
