import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, GraphNode } from '../services/api';

export const GraphScreen: React.FC = () => {
  const { colors, radius, shadows } = useTheme();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getGraph();
      const rawNodes = res.nodes || (res as any).claims || [];
      setNodes(rawNodes);
    } catch (err: any) {
      setError(err?.message || 'Could not load knowledge graph');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const renderNode = ({ item }: { item: GraphNode }) => {
    const masteryPercent = Math.round((item.mastery || 0.8) * 100);

    return (
      <View
        style={[
          styles.nodeCard,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.borderSubtle,
            borderRadius: radius.lg,
          },
          shadows.sm,
        ]}
      >
        <View style={styles.nodeHeader}>
          <Text style={[styles.nodeTitle, { color: colors.textPrimary }]}>
            {item.name || 'Concept Claim'}
          </Text>
          <View
            style={[
              styles.masteryPill,
              { backgroundColor: colors.successMuted, borderRadius: radius.full },
            ]}
          >
            <Text style={[styles.masteryText, { color: colors.success }]}>
              {masteryPercent}% Mastery
            </Text>
          </View>
        </View>

        <Text style={[styles.statementText, { color: colors.textSecondary }]}>
          {item.statement || 'Proven foundation concept recorded from previous turns.'}
        </Text>
      </View>
    );
  };

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
          Knowledge Graph
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Claims & reasoning chains carried across your sessions
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Exploring knowledge map...
          </Text>
        </View>
      ) : (
        <FlatList
          data={nodes}
          renderItem={renderNode}
          keyExtractor={(item, idx) => item.id || String(idx)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchGraph();
              }}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="git-network-outline" size={48} color={colors.accent} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Knowledge Map is Empty
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                As you learn in sessions, proven claims and concepts will crystallize here.
              </Text>
            </View>
          }
        />
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
  loadingText: {
    marginTop: 10,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  nodeCard: {
    padding: 14,
    borderWidth: 1,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  nodeTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  masteryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  masteryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statementText: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
});
