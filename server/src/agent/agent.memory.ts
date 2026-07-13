import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { ModelMessage } from 'ai';
import { DatabaseService } from '../database/database.service';
import * as fs from 'fs';
import { join } from 'path';
import type { AgentAsset } from './agent-assets';
import type { AgentPlan, AgentPlanStep } from './agent.protocol';
import {
  compactMessagesForModel,
  compactMessagesForPersistence,
} from './message-context';

/**
 * Conversation history per session, persisted in SQLite database.
 * Screenshots are saved as local files in './files' to prevent DB bloat.
 *
 * Key features:
 *  - Persistent storage across backend restarts/reloads.
 *  - Token-aware truncation (approximate) instead of raw message count.
 *  - Session TTL: stale sessions and their files are cleaned up automatically.
 *  - Preserves tool-call / tool-result pairs when truncating.
 */
interface SessionEntry {
  userId?: string;
  messages: ModelMessage[];
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
  assets?: AgentAsset[];
  plan?: AgentPlan;
  screenshot?: string; // local file path
  lastExportedNodeImage?: string; // local file path
}

@Injectable()
export class AgentMemory implements OnModuleDestroy {
  private readonly logger = new Logger(AgentMemory.name);

  /** Approximate max tokens to keep in history. */
  private readonly MAX_TOKENS = 40_000;

  /** Session TTL in ms (default 30 days). */
  private readonly SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  /** Cleanup interval in ms (every 5 min). */
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(private readonly dbService: DatabaseService) {
    // Periodically clean up expired sessions
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private getFilePath(sessionId: string, type: 'screenshot' | 'node_image'): string {
    return join('files', `${type}_${sessionId}.png`);
  }

  private saveFileSync(sessionId: string, type: 'screenshot' | 'node_image', base64: string): string | null {
    if (!base64) return null;
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const filePath = this.getFilePath(sessionId, type);
    try {
      // Ensure target directory exists (should be './files')
      const dir = join(process.cwd(), 'files');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, Buffer.from(cleanBase64, "base64"));
      return filePath;
    } catch (e: any) {
      this.logger.error(`Failed to save file for session ${sessionId}: ${e.message}`);
      return null;
    }
  }

  private readFileSync(filePath: string): string | null {
    if (!filePath) return null;
    try {
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
      }
    } catch (e: any) {
      this.logger.error(`Failed to read file ${filePath}: ${e.message}`);
    }
    return null;
  }

  private getSession(sessionId: string): SessionEntry | null {
    const db = this.dbService.db;
    try {
      const row = db.query("SELECT * FROM agent_sessions WHERE sessionId = ?").get(sessionId) as any;
      if (!row) return null;
      return {
        messages: JSON.parse(row.messages),
        userId: row.userId || undefined,
        lastAccess: Number(row.lastAccess),
        brand: row.brand ? JSON.parse(row.brand) : undefined,
        assets: row.assets ? JSON.parse(row.assets) : undefined,
        plan: row.plan ? JSON.parse(row.plan) : undefined,
        screenshot: row.screenshot || undefined,
        lastExportedNodeImage: row.lastExportedNodeImage || undefined,
      };
    } catch (e: any) {
      this.logger.error(`Failed to get session ${sessionId}: ${e.message}`);
      return null;
    }
  }

  private saveSession(sessionId: string, entry: SessionEntry): void {
    const db = this.dbService.db;
    const now = Date.now();
    try {
      const row = db.query("SELECT sessionId FROM agent_sessions WHERE sessionId = ?").get(sessionId) as any;
      if (row) {
        db.query(
          "UPDATE agent_sessions SET messages = ?, brand = ?, assets = ?, plan = ?, screenshot = ?, lastExportedNodeImage = ?, userId = COALESCE(userId, ?), lastAccess = ? WHERE sessionId = ?"
        ).run(
          JSON.stringify(entry.messages),
          entry.brand ? JSON.stringify(entry.brand) : null,
          entry.assets ? JSON.stringify(entry.assets) : null,
          entry.plan ? JSON.stringify(entry.plan) : null,
          entry.screenshot || null,
          entry.lastExportedNodeImage || null,
          entry.userId || null,
          now,
          sessionId
        );
      } else {
        db.query(
          "INSERT INTO agent_sessions (sessionId, messages, brand, assets, plan, screenshot, lastExportedNodeImage, userId, lastAccess) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          sessionId,
          JSON.stringify(entry.messages),
          entry.brand ? JSON.stringify(entry.brand) : null,
          entry.assets ? JSON.stringify(entry.assets) : null,
          entry.plan ? JSON.stringify(entry.plan) : null,
          entry.screenshot || null,
          entry.lastExportedNodeImage || null,
          entry.userId || null,
          now
        );
      }
    } catch (e: any) {
      this.logger.error(`Failed to save session ${sessionId}: ${e.message}`);
    }
  }

  claimSession(sessionId: string, userId: string): void {
    const db = this.dbService.db;
    db.transaction(() => {
      const existing = db.query("SELECT userId FROM agent_sessions WHERE sessionId = ?").get(sessionId) as any;
      if (existing?.userId && existing.userId !== userId) {
        throw new ForbiddenException("Agent session belongs to another user");
      }
      if (existing) {
        db.query("UPDATE agent_sessions SET userId = ?, lastAccess = ? WHERE sessionId = ?")
          .run(userId, Date.now(), sessionId);
      } else {
        db.query(`
          INSERT INTO agent_sessions (sessionId, messages, userId, lastAccess)
          VALUES (?, '[]', ?, ?)
        `).run(sessionId, userId, Date.now());
      }
    })();
  }

  assertOwner(sessionId: string, userId: string): void {
    const row = this.dbService.db.query(
      "SELECT userId FROM agent_sessions WHERE sessionId = ?",
    ).get(sessionId) as any;
    if (!row || row.userId !== userId) {
      throw new ForbiddenException("Agent session not found or not owned by user");
    }
  }

  get(sessionId: string): ModelMessage[] {
    const session = this.getSession(sessionId);
    if (!session) return [];
    
    // Update lastAccess in DB
    try {
      const db = this.dbService.db;
      db.query("UPDATE agent_sessions SET lastAccess = ? WHERE sessionId = ?").run(Date.now(), sessionId);
    } catch (e: any) {
      this.logger.error(`Failed to update lastAccess for session ${sessionId}: ${e.message}`);
    }
    
    const compacted = this.truncateByTokens(
      compactMessagesForPersistence(session.messages),
    );
    if (JSON.stringify(compacted) !== JSON.stringify(session.messages)) {
      session.messages = compacted;
      this.saveSession(sessionId, session);
    }
    return compacted;
  }

  set(sessionId: string, messages: ModelMessage[]): void {
    const compacted = compactMessagesForPersistence(messages);
    const truncated = this.truncateByTokens(compacted);
    
    let session = this.getSession(sessionId);
    if (session) {
      session.messages = truncated;
    } else {
      session = { messages: truncated, lastAccess: Date.now() };
    }
    this.saveSession(sessionId, session);
  }

  compactForModel(messages: ModelMessage[]): ModelMessage[] {
    return compactMessagesForModel(messages);
  }

  reset(sessionId: string): void {
    const db = this.dbService.db;
    const session = this.getSession(sessionId);
    if (session) {
      if (session.screenshot && fs.existsSync(session.screenshot)) {
        try { fs.unlinkSync(session.screenshot); } catch {}
      }
      if (session.lastExportedNodeImage && fs.existsSync(session.lastExportedNodeImage)) {
        try { fs.unlinkSync(session.lastExportedNodeImage); } catch {}
      }
    }
    try {
      db.query("DELETE FROM agent_sessions WHERE sessionId = ?").run(sessionId);
    } catch (e: any) {
      this.logger.error(`Failed to delete session ${sessionId} from database: ${e.message}`);
    }
  }

  getBrand(sessionId: string) {
    const session = this.getSession(sessionId);
    return session?.brand ?? null;
  }

  setBrand(sessionId: string, brand: NonNullable<SessionEntry['brand']>): void {
    let session = this.getSession(sessionId);
    if (session) {
      session.brand = brand;
    } else {
      session = { messages: [], lastAccess: Date.now(), brand };
    }
    this.saveSession(sessionId, session);
  }

  getAssets(sessionId: string): AgentAsset[] {
    return this.getSession(sessionId)?.assets ?? [];
  }

  registerAssets(sessionId: string, assets: AgentAsset[]): AgentAsset[] {
    if (assets.length === 0) return this.getAssets(sessionId);
    let session = this.getSession(sessionId) ?? { messages: [], lastAccess: Date.now() };
    const merged = new Map((session.assets ?? []).map((asset) => [asset.id, asset]));
    for (const asset of assets) merged.set(asset.id, asset);
    session.assets = [...merged.values()].slice(-64);
    this.saveSession(sessionId, session);
    return session.assets;
  }

  getPlan(sessionId: string): AgentPlan | null {
    return this.getSession(sessionId)?.plan ?? null;
  }

  setPlan(sessionId: string, plan: AgentPlan): void {
    const session = this.getSession(sessionId) ?? { messages: [], lastAccess: Date.now() };
    session.plan = plan;
    this.saveSession(sessionId, session);
  }

  updatePlanForTool(
    sessionId: string,
    tool: string,
    input: any,
    completed: boolean,
    failed = false,
  ): AgentPlan | null {
    const session = this.getSession(sessionId);
    const plan = session?.plan;
    if (!session || !plan) return null;

    const matches = (step: AgentPlanStep) => {
      if (!step.tools?.includes(tool)) return false;
      if (step.platform && input?.platform && step.platform !== input.platform) return false;
      if (step.deliverable && input?.deliverable && step.deliverable !== input.deliverable) return false;
      return true;
    };
    const candidates = plan.steps.filter(matches);
    const step =
      candidates.find((item) => item.status === 'in_progress') ??
      candidates.find((item) => item.status === 'pending') ??
      candidates.find((item) => item.status === 'failed' || item.status === 'error');
    if (!step) return plan;

    if (failed) step.status = 'failed';
    else if (completed && step.completionTool === tool) step.status = 'completed';
    else if (step.status === 'pending' || step.status === 'failed' || step.status === 'error') {
      step.status = 'in_progress';
    }
    this.saveSession(sessionId, session);
    return plan;
  }

  getScreenshot(sessionId: string): string | null {
    const session = this.getSession(sessionId);
    if (!session || !session.screenshot) return null;
    return this.readFileSync(session.screenshot);
  }

  consumeScreenshot(sessionId: string): string | null {
    const session = this.getSession(sessionId);
    if (!session?.screenshot) return null;
    const screenshotPath = session.screenshot;
    const image = this.readFileSync(screenshotPath);
    session.screenshot = undefined;
    if (fs.existsSync(screenshotPath)) {
      try { fs.unlinkSync(screenshotPath); } catch {}
    }
    this.saveSession(sessionId, session);
    return image;
  }

  setScreenshot(sessionId: string, base64: string): void {
    const filePath = this.saveFileSync(sessionId, 'screenshot', base64);
    let session = this.getSession(sessionId);
    if (session) {
      session.screenshot = filePath || undefined;
    } else {
      session = { messages: [], lastAccess: Date.now(), screenshot: filePath || undefined };
    }
    this.saveSession(sessionId, session);
  }

  getLastExportedNodeImage(sessionId: string): string | null {
    const session = this.getSession(sessionId);
    if (!session || !session.lastExportedNodeImage) return null;
    return this.readFileSync(session.lastExportedNodeImage);
  }

  setLastExportedNodeImage(sessionId: string, base64: string): void {
    const filePath = this.saveFileSync(sessionId, 'node_image', base64);
    let session = this.getSession(sessionId);
    if (session) {
      session.lastExportedNodeImage = filePath || undefined;
    } else {
      session = { messages: [], lastAccess: Date.now(), lastExportedNodeImage: filePath || undefined };
    }
    this.saveSession(sessionId, session);
  }

  /** Return count of active sessions (useful for monitoring). */
  get sessionCount(): number {
    const db = this.dbService.db;
    try {
      const row = db.query("SELECT COUNT(*) as count FROM agent_sessions").get() as any;
      return row ? Number(row.count) : 0;
    } catch {
      return 0;
    }
  }

  getAllSessions(userId?: string): { sessionId: string; messages: ModelMessage[]; lastAccess: number }[] {
    const db = this.dbService.db;
    try {
      const rows = userId
        ? db.query("SELECT sessionId, messages, lastAccess FROM agent_sessions WHERE userId = ?").all(userId) as any[]
        : db.query("SELECT sessionId, messages, lastAccess FROM agent_sessions").all() as any[];
      return rows.map((row) => ({
        sessionId: row.sessionId,
        messages: JSON.parse(row.messages),
        lastAccess: Number(row.lastAccess),
      }));
    } catch (e: any) {
      this.logger.error(`Failed to get all sessions: ${e.message}`);
      return [];
    }
  }


  // ── Token-aware truncation ─────────────────────────────────────────────────

  /**
   * Approximate token count for a message. Uses a simple heuristic:
   * ~4 chars per token for English, ~2 chars per token for CJK.
   * Good enough for truncation decisions; not for billing.
   */
  private estimateTokens(msg: ModelMessage): number {
    let text = '';
    let imageTokens = 0;
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const p of msg.content as any[]) {
        if (p.type === 'text') {
          text += p.text ?? '';
        } else if (p.type === 'image') {
          imageTokens += 1000; // standard vision model cost
        } else if (p.type === 'tool-call') {
          text += p.toolName ?? '';
          text += typeof p.input === 'string' ? p.input : JSON.stringify(p.input ?? {});
        } else if (p.type === 'tool-result') {
          text += typeof p.output === 'string' ? p.output : JSON.stringify(p.output ?? {});
        }
      }
    }
    if (!text && imageTokens === 0) return 4; // minimal overhead for role/metadata

    // Rough heuristic: CJK chars ≈ 0.5 tokens each, ASCII ≈ 0.25 tokens each
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) ?? []).length;
    const asciiCount = text.length - cjkCount;
    return Math.ceil(cjkCount * 0.5 + asciiCount * 0.25) + imageTokens + 4; // +4 for message overhead
  }

  /**
   * Truncate from the front, preserving the most recent messages,
   * while keeping tool_call / tool pairs intact.
   */
  private truncateByTokens(messages: ModelMessage[]): ModelMessage[] {
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
    const db = this.dbService.db;
    const expireTime = Date.now() - this.SESSION_TTL_MS;
    try {
      // Find expired sessions to delete their files
      const expired = db.query("SELECT * FROM agent_sessions WHERE lastAccess < ?").all(expireTime) as any[];
      for (const row of expired) {
        if (row.screenshot && fs.existsSync(row.screenshot)) {
          try { fs.unlinkSync(row.screenshot); } catch {}
        }
        if (row.lastExportedNodeImage && fs.existsSync(row.lastExportedNodeImage)) {
          try { fs.unlinkSync(row.lastExportedNodeImage); } catch {}
        }
      }
      const res = db.query("DELETE FROM agent_sessions WHERE lastAccess < ?").run(expireTime);
      if (res.changes > 0) {
        this.logger.log(`Cleaned up ${res.changes} expired session(s) from database.`);
      }
    } catch (e: any) {
      this.logger.error(`Failed to clean up expired sessions: ${e.message}`);
    }
  }
}
