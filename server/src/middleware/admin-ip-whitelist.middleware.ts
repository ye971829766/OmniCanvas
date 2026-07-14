import { Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

/**
 * Optional allow-list for management APIs (/admin/*).
 * Env: ADMIN_IP_WHITELIST=127.0.0.1,::1,203.0.113.10
 * Empty / unset → no restriction (useful for local dev).
 */
@Injectable()
export class AdminIpWhitelistMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (req.headers["x-internal-forward"] === "1") return next();

    const path = (req.originalUrl || req.url || "/").split("?")[0];
    if (!path.startsWith("/admin/")) return next();

    const allow = this.allowedIps();
    if (allow.length === 0) return next();

    const ip = this.clientIp(req);
    if (this.isAllowed(ip, allow)) return next();

    console.warn(`[AdminIpWhitelist] blocked admin access from ${ip} path=${path}`);
    res.status(403).json({
      statusCode: 403,
      message: "当前网络不允许访问管理接口",
    });
    return;
  }

  private allowedIps(): string[] {
    const raw = process.env.ADMIN_IP_WHITELIST || process.env.ADMIN_ALLOWED_IPS || "";
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private clientIp(req: Request): string {
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.trim()) {
      return xf.split(",")[0].trim();
    }
    if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0].trim();
    // Express may give :ffff:127.0.0.1
    return (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  }

  private isAllowed(ip: string, allow: string[]): boolean {
    const normalized = ip.replace(/^::ffff:/, "");
    return allow.some((entry) => {
      const e = entry.replace(/^::ffff:/, "");
      if (e === "*" || e === "0.0.0.0/0") return true;
      if (e === normalized || e === ip) return true;
      // localhost aliases
      if (
        (e === "127.0.0.1" || e === "::1" || e === "localhost") &&
        (normalized === "127.0.0.1" || normalized === "::1" || ip === "::1")
      ) {
        return true;
      }
      return false;
    });
  }
}
