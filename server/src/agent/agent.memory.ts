import { Injectable, Logger } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * In-memory conversation history per session. Stores OpenAI message params so
 * they replay straight into the next turn.
 *
 * Improvements over the original:
 *  - Token-aware truncation (approximate) instead of raw message count.
 *  - Session TTL: stale sessions are cleaned up automatically.
 *  - Preserves tool-call / tool-result pairs when truncating.
 */
interface SessionEntry {
  messages: ChatCompletionMessageParam[];
  lastAccess: number;
  brand?: {
    palette?: {
      primary: string;
      secondary: string;
      accent: string;
      text: string;
      background: string;
    };
    fontFamily?: string;
    styleKeywords?: string[];
  };
  screenshot?: string; // base64 image
}

@Injectable()
export class AgentMemory {
  private readonly logger = new Logger(AgentMemory.name);
  private store = new Map<string, SessionEntry>();

  /** Approximate max tokens to keep in history. */
  private readonly MAX_TOKENS = 24_000;
  /** Session TTL in ms (default 30 min). */
  private readonly SESSION_TTL_MS = 30 * 60 * 1000;
  /** Cleanup interval in ms (every 5 min). */
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Periodically clean up expired sessions
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
  }

  get(sessionId: string): ChatCompletionMessageParam[] {
    const entry = this.store.get(sessionId);
    if (!entry) return [];
    entry.lastAccess = Date.now();
    return entry.messages;
  }

  set(sessionId: string, messages: ChatCompletionMessageParam[]): void {
    const truncated = this.truncateByTokens(messages);
    const entry = this.store.get(sessionId);
    if (entry) {
      entry.messages = truncated;
      entry.lastAccess = Date.now();
    } else {
      this.store.set(sessionId, { messages: truncated, lastAccess: Date.now() });
    }
  }

  reset(sessionId: string): void {
    this.store.delete(sessionId);
  }

  getBrand(sessionId: string) {
    return this.store.get(sessionId)?.brand ?? null;
  }

  setBrand(sessionId: string, brand: NonNullable<SessionEntry['brand']>): void {
    const entry = this.store.get(sessionId);
    if (entry) {
      entry.brand = brand;
      entry.lastAccess = Date.now();
    } else {
      this.store.set(sessionId, { messages: [], lastAccess: Date.now(), brand });
    }
  }

  getScreenshot(sessionId: string): string | null {
    return this.store.get(sessionId)?.screenshot ?? null;
  }

  setScreenshot(sessionId: string, base64: string): void {
    const entry = this.store.get(sessionId);
    if (entry) {
      entry.screenshot = base64;
      entry.lastAccess = Date.now();
    } else {
      this.store.set(sessionId, { messages: [], lastAccess: Date.now(), screenshot: base64 });
    }
  }

  /** Return count of active sessions (useful for monitoring). */
  get sessionCount(): number {
    return this.store.size;
  }

  // ── Token-aware truncation ─────────────────────────────────────────────────

  /**
   * Approximate token count for a message. Uses a simple heuristic:
   * ~4 chars per token for English, ~2 chars per token for CJK.
   * Good enough for truncation decisions; not for billing.
   */
  private estimateTokens(msg: ChatCompletionMessageParam): number {
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text ?? '')
        .join('');
    }
    // tool_calls have function args
    if ('tool_calls' in msg && Array.isArray((msg as any).tool_calls)) {
      for (const tc of (msg as any).tool_calls) {
        text += tc.function?.name ?? '';
        text += tc.function?.arguments ?? '';
      }
    }
    if (!text) return 4; // minimal overhead for role/metadata

    // Rough heuristic: CJK chars ≈ 0.5 tokens each, ASCII ≈ 0.25 tokens each
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) ?? []).length;
    const asciiCount = text.length - cjkCount;
    return Math.ceil(cjkCount * 0.5 + asciiCount * 0.25) + 4; // +4 for message overhead
  }

  /**
   * Truncate from the front, preserving the most recent messages,
   * while keeping tool_call / tool pairs intact.
   */
  private truncateByTokens(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
    // Calculate total tokens
    const tokenCounts = messages.map((m) => this.estimateTokens(m));
    let totalTokens = tokenCounts.reduce((a, b) => a + b, 0);

    if (totalTokens <= this.MAX_TOKENS) return messages;

    // Drop messages from the front until we fit
    let startIdx = 0;
    while (startIdx < messages.length && totalTokens > this.MAX_TOKENS) {
      totalTokens -= tokenCounts[startIdx]!;
      startIdx++;
    }

    // Ensure we don't start on a 'tool' message (orphaned tool result)
    // because OpenAI API rejects tool messages without a matching assistant tool_call
    while (startIdx < messages.length && messages[startIdx]!.role === 'tool') {
      totalTokens -= tokenCounts[startIdx]!;
      startIdx++;
    }

    const truncated = messages.slice(startIdx);
    if (truncated.length < messages.length) {
      this.logger.debug(
        `Truncated history: ${messages.length} → ${truncated.length} messages ` +
        `(~${totalTokens} tokens)`,
      );
    }
    return truncated;
  }

  // ── Session cleanup ────────────────────────────────────────────────────────

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [sid, entry] of this.store) {
      if (now - entry.lastAccess > this.SESSION_TTL_MS) {
        this.store.delete(sid);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired session(s). Active: ${this.store.size}`);
    }
  }
}
