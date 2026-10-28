import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

export interface QuestionData {
  toolCallId: string;
  tool: string;
  question: string;
  options?: string[];
  explanation?: string;
}

export interface QuestionCardProps {
  data: QuestionData;
  onSubmit: (answer: {
    toolCallId: string;
    choice?: string;
    confidence: number;
    thinking?: string;
  }) => void;
  disabled?: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  data,
  onSubmit,
  disabled = false,
}) => {
  const { colors, radius, shadows } = useTheme();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(3); // 1 to 5
  const [thinking, setThinking] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const handleSubmit = () => {
    if (disabled || isSubmitted) return;
    setIsSubmitted(true);
    onSubmit({
      toolCallId: data.toolCallId,
      choice: selectedOption || undefined,
      confidence,
      thinking: thinking.trim() ? thinking.trim() : undefined,
    });
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.backgroundCard,
          borderColor: colors.borderSubtle,
          borderRadius: radius.lg,
        },
        shadows.med,
      ]}
    >
      {/* Header Tag */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.badge,
            { backgroundColor: colors.accentMuted, borderRadius: radius.full },
          ]}
        >
          <Ionicons name="sparkles" size={12} color={colors.accent} />
          <Text style={[styles.badgeText, { color: colors.accent }]}>
            Understanding Check
          </Text>
        </View>
      </View>

      {/* Question Statement */}
      <Text style={[styles.questionText, { color: colors.textPrimary }]}>
        {data.question}
      </Text>

      {/* Options if provided */}
      {data.options && data.options.length > 0 ? (
        <View style={styles.optionsList}>
          {data.options.map((opt, idx) => {
            const isSelected = selectedOption === opt;
            return (
              <Pressable
                key={idx}
                onPress={() => !isSubmitted && setSelectedOption(opt)}
                disabled={isSubmitted || disabled}
                style={({ pressed }) => [
                  styles.optionButton,
                  {
                    borderColor: isSelected ? colors.accent : colors.borderSubtle,
                    backgroundColor: isSelected
                      ? colors.accentMuted
                      : colors.backgroundSurface,
                    borderRadius: radius.md,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.radioCircle,
                    {
                      borderColor: isSelected ? colors.accent : colors.textDisabled,
                      backgroundColor: isSelected ? colors.accent : 'transparent',
                    },
                  ]}
                >
                  {isSelected ? (
                    <View
                      style={[
                        styles.radioDot,
                        { backgroundColor: colors.onAccent },
                      ]}
                    />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.optionLabel,
                    {
                      color: isSelected ? colors.textAccent : colors.textPrimary,
                      fontWeight: isSelected ? '600' : '400',
                    },
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!isSubmitted ? (
        <>
          {/* Confidence Scale */}
          <View style={styles.confidenceSection}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              How confident are you in this answer?
            </Text>
            <View style={styles.confidenceRow}>
              {[1, 2, 3, 4, 5].map((lvl) => {
                const active = confidence === lvl;
                return (
                  <Pressable
                    key={lvl}
                    onPress={() => setConfidence(lvl)}
                    style={[
                      styles.confidencePill,
                      {
                        backgroundColor: active ? colors.accent : colors.backgroundSurface,
                        borderColor: active ? colors.accent : colors.borderSubtle,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.confidenceNumber,
                        { color: active ? colors.onAccent : colors.textPrimary },
                      ]}
                    >
                      {lvl}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.confidenceDescRow}>
              <Text style={[styles.descText, { color: colors.textDisabled }]}>
                Guessing
              </Text>
              <Text style={[styles.descText, { color: colors.textDisabled }]}>
                Certain
              </Text>
            </View>
          </View>

          {/* Thinking / doubts input */}
          <View style={styles.thinkingInputSection}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Your reasoning / doubts (optional):
            </Text>
            <TextInput
              value={thinking}
              onChangeText={setThinking}
              placeholder="Why this answer? Any confusion?"
              placeholderTextColor={colors.textDisabled}
              style={[
                styles.thinkingInput,
                {
                  color: colors.textPrimary,
                  borderColor: colors.borderSubtle,
                  backgroundColor: colors.backgroundSurface,
                  borderRadius: radius.md,
                },
              ]}
              multiline
            />
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={disabled}
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: colors.accent,
                borderRadius: radius.md,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text style={[styles.submitButtonText, { color: colors.onAccent }]}>
              Submit Answer
            </Text>
          </Pressable>
        </>
      ) : (
        <View style={[styles.submittedBanner, { backgroundColor: colors.successMuted }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[styles.submittedText, { color: colors.success }]}>
            Recorded. Tutor is adapting the plan.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
    padding: 14,
    borderWidth: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    gap: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  questionText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 10,
  },
  optionsList: {
    gap: 6,
    marginBottom: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  radioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  optionLabel: {
    fontSize: 13.5,
    flex: 1,
  },
  confidenceSection: {
    marginTop: 6,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 6,
  },
  confidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  confidencePill: {
    flex: 1,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  confidenceNumber: {
    fontSize: 13,
    fontWeight: '600',
  },
  confidenceDescRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  descText: {
    fontSize: 10,
  },
  thinkingInputSection: {
    marginBottom: 12,
  },
  thinkingInput: {
    borderWidth: 1,
    padding: 8,
    fontSize: 12.5,
    minHeight: 44,
  },
  submitButton: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  submittedText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
