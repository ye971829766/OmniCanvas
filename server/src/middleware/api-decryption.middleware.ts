import { Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { decryptData, isApiCryptoEnabled } from "../utils/api-crypto";

/**
 * Legacy body decrypt for direct routes (when strict mode is off).
 * Tunnel mode (/api/rpc) keeps { encrypted } and decrypts inside the gateway.
 */
@Injectable()
export class ApiDecryptionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!isApiCryptoEnabled()) return next();

    // Internal dispatch is already plain JSON
    if (req.headers["x-internal-forward"] === "1") return next();

    // RPC tunnel decrypts the full envelope itself
    const path = (req.originalUrl || req.url || "").split("?")[0];
    if (path === "/api/rpc" || path === "/api/rpc/") return next();

    if (
      req.headers["x-api-crypto"] === "true" &&
      req.body &&
      typeof req.body === "object" &&
      (req.body as { encrypted?: string }).encrypted
    ) {
      try {
        const decryptedStr = decryptData(
          String((req.body as { encrypted: string }).encrypted),
        );
        req.body = JSON.parse(decryptedStr);
      } catch (err) {
        console.error("[ApiDecryptionMiddleware] Failed to decrypt request:", err);
        res.status(400).json({ statusCode: 400, message: "Invalid encrypted payload" });
        return;
      }
    }
    next();
  }
}
