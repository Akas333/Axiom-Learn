/**
 * OptiMind Mobile API Client
 * Connects to the Axiom/Kapany backend server (@axiom/server on port 8787)
 */

import { Platform } from 'react-native';

export interface ChatSession {
  id: string;
  title: string;
  updatedAt?: number;
  createdAt?: number;
  busy?: boolean;
  phase?: string;
  pendingQuestion?: any;
  turnError?: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  text?: string;
  question?: any;
  thinking?: string;
  plan?: any;
  timestamp?: number;
}

export interface GraphNode {
  id: string;
  name: string;
  statement: string;
  mastery?: number;
  category?: string;
}

export interface GraphResponse {
  nodes?: GraphNode[];
  chains?: any[];
  claims?: any[];
}

export interface ReviewItem {
  id: string;
  nodeId: string;
  front: string;
  back: string;
  due?: number;
  interval?: number;
  ease?: number;
}

// Candidates for connection: ADB reverse maps 8787 -> localhost:8787.
// 10.0.2.2 is the emulator virtual router.
const CANDIDATE_HOSTS = Platform.select({
  android: [
    'http://127.0.0.1:8787',
    'http://localhost:8787',
    'http://10.0.2.2:8787',
    'http://172.20.201.180:8787',
  ],
  default: [
    'http://localhost:8787',
    'http://127.0.0.1:8787',
  ],
}) || ['http://localhost:8787'];

class ApiService {
  private activeHost: string = CANDIDATE_HOSTS[0];
  private candidateIndex: number = 0;

  public getBaseUrl(): string {
    return this.activeHost;
  }

  public setBaseUrl(url: string): void {
    let clean = url.trim();
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    this.activeHost = clean;
  }

  /**
   * Resilient JSON fetch with auto-failover across Android emulator interfaces
   */
  private async fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const maxTries = CANDIDATE_HOSTS.length;
    let lastError: any = null;

    for (let attempt = 0; attempt < maxTries; attempt++) {
      const host = this.activeHost;
      const url = `${host}${path}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options?.headers || {}),
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(
            `API (${response.status}): ${errorText || response.statusText}`
          );
        }

        return (await response.json()) as T;
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        // Auto switch to next candidate host
        this.candidateIndex = (this.candidateIndex + 1) % CANDIDATE_HOSTS.length;
        this.activeHost = CANDIDATE_HOSTS[this.candidateIndex];
      }
    }

    throw new Error(
      lastError?.message || 'Could not connect to backend server on port 8787'
    );
  }

  /** Check if backend is reachable */
  public async testConnection(): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const data = await this.listChats();
      return { ok: true, status: 200 };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Connection failed' };
    }
  }

  /** List all active sessions */
  public async listChats(): Promise<ChatSession[]> {
    const data = await this.fetchJson<{ chats: ChatSession[] }>('/api/chats');
    return data.chats || [];
  }

  /** Create a new teaching or practice session */
  public async createChat(title: string, kind?: 'practice' | 'teach'): Promise<{ id: string; title: string }> {
    return await this.fetchJson<{ id: string; title: string }>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ title, kind }),
    });
  }

  /** Fetch session details and message history */
  public async getChat(chatId: string): Promise<{
    id: string;
    title: string;
    messages: any[];
    turnError?: string;
    plan?: any;
  }> {
    return await this.fetchJson(`/api/chats/${encodeURIComponent(chatId)}`);
  }

  /** Delete a session */
  public async deleteChat(chatId: string): Promise<void> {
    await this.fetchJson(`/api/chats/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    });
  }

  /** Send a turn input to the AI tutor */
  public async sendChatInput(
    chatId: string,
    input:
      | { type: 'text'; text: string }
      | { type: 'continue' }
      | { type: 'next' }
      | { type: 'answer'; toolCallId: string; answer: any }
      | { type: 'thinking'; problemCallId: string; text: string }
  ): Promise<any> {
    return await this.fetchJson('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ chatId, input }),
    });
  }

  /** Fetch learner knowledge graph */
  public async getGraph(): Promise<GraphResponse> {
    return await this.fetchJson<GraphResponse>('/api/graph');
  }

  /** Fetch flashcard spaced review queue */
  public async getReview(): Promise<{ items?: ReviewItem[] }> {
    return await this.fetchJson<{ items?: ReviewItem[] }>('/api/review');
  }

  /** Fetch available Meta models */
  public async getModels(): Promise<any> {
    return await this.fetchJson('/api/models');
  }
}

export const api = new ApiService();
