import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface RecordTokenPayload {
  userId?: string;
  username?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  type?: string;
}

export interface UserTokenStat {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
  lastUsedAt?: string;
}

export interface SystemTokenStats {
  total: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalRequests: number;
    activeUsersCount: number;
  };
  users: UserTokenStat[];
}

@Injectable()
export class TokensService {
  constructor(private readonly dbService: DatabaseService) {}

  recordTokenUsage(payload: RecordTokenPayload): void {
    try {
      const db = this.dbService.db;
      const id = `tk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const prompt = Math.max(0, payload.promptTokens || 0);
      const completion = Math.max(0, payload.completionTokens || 0);
      const total = payload.totalTokens && payload.totalTokens > 0
        ? payload.totalTokens
        : prompt + completion;
      const createdAt = new Date().toISOString();

      db.run(
        `INSERT INTO token_logs (id, userId, username, model, promptTokens, completionTokens, totalTokens, type, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          payload.userId || null,
          payload.username || null,
          payload.model || "unknown",
          prompt,
          completion,
          total,
          payload.type || "chat",
          createdAt,
        ],
      );
    } catch (err) {
      console.error("Failed to record token usage:", err);
    }
  }

  getTokenStats(): SystemTokenStats {
    const db = this.dbService.db;

    // 1. System Overall Totals
    const totalRow = db
      .query(
        `SELECT 
          COALESCE(SUM(promptTokens), 0) as promptTokens,
          COALESCE(SUM(completionTokens), 0) as completionTokens,
          COALESCE(SUM(totalTokens), 0) as totalTokens,
          COUNT(*) as totalRequests
         FROM token_logs`,
      )
      .get() as any;

    const systemTotals = {
      promptTokens: Number(totalRow?.promptTokens || 0),
      completionTokens: Number(totalRow?.completionTokens || 0),
      totalTokens: Number(totalRow?.totalTokens || 0),
      totalRequests: Number(totalRow?.totalRequests || 0),
      activeUsersCount: 0,
    };

    // 2. User Stats: Combine registered users & logged usage
    const userRows = db
      .query(
        `SELECT 
          u.id as userId,
          u.username as username,
          u.nickname as nickname,
          u.avatarUrl as avatarUrl,
          COALESCE(SUM(t.promptTokens), 0) as promptTokens,
          COALESCE(SUM(t.completionTokens), 0) as completionTokens,
          COALESCE(SUM(t.totalTokens), 0) as totalTokens,
          COUNT(t.id) as requestCount,
          MAX(t.createdAt) as lastUsedAt
         FROM users u
         LEFT JOIN token_logs t ON (t.userId = u.id OR t.username = u.username)
         GROUP BY u.id
         ORDER BY totalTokens DESC, requestCount DESC`,
      )
      .all() as any[];

    // Also check for anonymous / unlinked token logs
    const anonRows = db
      .query(
        `SELECT 
          'anonymous' as userId,
          '游客' as username,
          '游客' as nickname,
          NULL as avatarUrl,
          COALESCE(SUM(promptTokens), 0) as promptTokens,
          COALESCE(SUM(completionTokens), 0) as completionTokens,
          COALESCE(SUM(totalTokens), 0) as totalTokens,
          COUNT(id) as requestCount,
          MAX(createdAt) as lastUsedAt
         FROM token_logs
         WHERE userId IS NULL OR userId = '' OR userId = 'guest'`,
      )
      .get() as any;

    const userStats: UserTokenStat[] = userRows.map((r) => ({
      userId: r.userId,
      username: r.username,
      nickname: r.nickname || r.username,
      avatarUrl: r.avatarUrl,
      promptTokens: Number(r.promptTokens || 0),
      completionTokens: Number(r.completionTokens || 0),
      totalTokens: Number(r.totalTokens || 0),
      requestCount: Number(r.requestCount || 0),
      lastUsedAt: r.lastUsedAt || undefined,
    }));

    if (anonRows && Number(anonRows.requestCount) > 0) {
      userStats.push({
        userId: "anonymous",
        username: "游客用户",
        nickname: "游客用户",
        avatarUrl: undefined,
        promptTokens: Number(anonRows.promptTokens || 0),
        completionTokens: Number(anonRows.completionTokens || 0),
        totalTokens: Number(anonRows.totalTokens || 0),
        requestCount: Number(anonRows.requestCount || 0),
        lastUsedAt: anonRows.lastUsedAt || undefined,
      });
    }

    // Sort by totalTokens descending
    userStats.sort((a, b) => b.totalTokens - a.totalTokens);

    systemTotals.activeUsersCount = userStats.filter(
      (u) => u.totalTokens > 0 || u.requestCount > 0,
    ).length;

    return {
      total: systemTotals,
      users: userStats,
    };
  }
}
