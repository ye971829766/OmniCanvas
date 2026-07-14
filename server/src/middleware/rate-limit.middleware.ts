import { Injectable, HttpStatus } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * Lightweight in-memory rate limiter (per-process).
 * Configure via env:
 *   RATE_LIMIT_ENABLED=true|false (default true)
 *   RATE_LIMIT_WINDOW_MS=60000
 *   RATE_LIMIT_GLOBAL=120
 *   RATE_LIMIT_AUTH=20
 *   RATE_LIMIT_ADMIN=60
 *   RATE_LIMIT_RPC=180
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private pruneAt = 0;

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.enabled()) return next();
    // Internal gateway hop must not double-count / block itself
    if (req.headers["x-internal-forward"] === "1") return next();

    const path = (req.originalUrl || req.url || "/").split("?")[0];
    // Never rate-limit payment webhooks
    if (path.startsWith("/billing/webhooks/")) return next();

    const ip = this.clientIp(req);
    const { limit, windowMs, scope } = this.policyFor(path, req.method);
    const key = `${scope}:${ip}`;
    const now = Date.now();
    this.prune(now);

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: "操作过于频繁，请稍后再试",
        retryAfter,
      });
      return;
    }

    next();
  }

  private enabled(): boolean {
    const raw = process.env.RATE_LIMIT_ENABLED;
    if (raw === undefined || raw === "") return true;
    return String(raw).toLowerCase() !== "false";
  }

  private clientIp(req: Request): string {
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.trim()) {
      return xf.split(",")[0].trim();
    }
    if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0].trim();
    return req.ip || req.socket?.remoteAddress || "unknown";
  }

  private policyFor(path: string, method: string): {
    limit: number;
    windowMs: number;
    scope: string;
  } {
    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
    const globalLimit = Number(process.env.RATE_LIMIT_GLOBAL || 120);
    const authLimit = Number(process.env.RATE_LIMIT_AUTH || 20);
    const adminLimit = Number(process.env.RATE_LIMIT_ADMIN || 60);
    const rpcLimit = Number(process.env.RATE_LIMIT_RPC || 180);

    if (
      path === "/auth/login" ||
      path === "/auth/register" ||
      path === "/auth/google"
    ) {
      return { limit: authLimit, windowMs, scope: "auth" };
    }
    if (path.startsWith("/admin/")) {
      return { limit: adminLimit, windowMs, scope: "admin" };
    }
    if (path === "/api/rpc" || path.startsWith("/api/rpc/")) {
      return { limit: rpcLimit, windowMs, scope: "rpc" };
    }
    // Stricter on mutating API surface
    if (["POST", "PUT", "PATCH", "DELETE"].includes(String(method).toUpperCase())) {
      return {
        limit: Math.max(40, Math.floor(globalLimit * 0.75)),
        windowMs,
        scope: "write",
      };
    }
    return { limit: globalLimit, windowMs, scope: "global" };
  }

  private prune(now: number) {
    if (now < this.pruneAt) return;
    this.pruneAt = now + 30_000;
    if (this.buckets.size < 5000) return;
    for (const [k, b] of this.buckets) {
      if (b.resetAt <= now) this.buckets.delete(k);
    }
  }
}
