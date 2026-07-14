import type { NestMiddleware } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import {
  isApiCryptoEnabled,
  isApiCryptoStrict,
  isCryptoAllowlistedPath,
} from "../utils/api-crypto";

/**
 * When API_CRYPTO + strict mode are on, hide semantic routes from the public surface.
 * Only /api/rpc (and allowlisted webhooks/static/stream/upload) remain reachable.
 * Internal loopback dispatches set X-Internal-Forward and pass through.
 */
@Injectable()
export class ApiCryptoGuardMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!isApiCryptoEnabled() || !isApiCryptoStrict()) {
      return next();
    }

    if (req.headers["x-internal-forward"] === "1") {
      return next();
    }

    const path = (req.originalUrl || req.url || "/").split("?")[0];
    if (isCryptoAllowlistedPath(path)) {
      return next();
    }

    // Opaque response — do not advertise that the route exists
    res.status(404).json({ statusCode: 404, message: "Not Found" });
  }
}
