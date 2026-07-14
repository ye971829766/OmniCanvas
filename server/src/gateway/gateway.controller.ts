import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  isApiCryptoEnabled,
  parseAndValidateEnvelope,
} from "../utils/api-crypto";

/**
 * Encrypted RPC front-door.
 * Clients send only POST /api/rpc with an AES envelope containing method/path/query/body.
 * Real semantic routes stay internal when API_CRYPTO_STRICT is enabled.
 *
 * Returns a plain object so the global encryption interceptor can wrap it
 * (do not use @Res() — that bypasses/fights the interceptor).
 */
@Controller("api")
export class GatewayController {
  @Post("rpc")
  async rpc(@Req() req: Request) {
    if (!isApiCryptoEnabled()) {
      throw new HttpException(
        "API crypto gateway is disabled",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const encrypted =
      req.body && typeof req.body === "object"
        ? (req.body as { encrypted?: string }).encrypted
        : undefined;
    if (!encrypted || typeof encrypted !== "string") {
      throw new HttpException("Encrypted envelope required", HttpStatus.BAD_REQUEST);
    }

    let envelope;
    try {
      envelope = parseAndValidateEnvelope(encrypted);
    } catch (err: any) {
      throw new HttpException(
        err?.message || "Invalid encrypted envelope",
        HttpStatus.BAD_REQUEST,
      );
    }

    if (envelope.p === "/api/rpc" || envelope.p.startsWith("/api/rpc/")) {
      throw new HttpException("Invalid target", HttpStatus.BAD_REQUEST);
    }

    const port = Number(process.env.PORT || 3000);
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(envelope.q || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) qs.append(key, String(item));
      } else {
        qs.set(key, String(value));
      }
    }
    const query = qs.toString();
    const targetUrl = `http://127.0.0.1:${port}${envelope.p}${query ? `?${query}` : ""}`;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Internal-Forward": "1",
    };
    const auth = req.headers.authorization;
    if (auth) headers.Authorization = String(auth);
    const idem = req.headers["idempotency-key"];
    if (idem) headers["Idempotency-Key"] = String(idem);

    const method = envelope.m.toUpperCase();
    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD" && envelope.b !== undefined && envelope.b !== null) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(envelope.b);
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(targetUrl, { method, headers, body });
    } catch (err: any) {
      throw new HttpException(
        err?.message || "Upstream gateway dispatch failed",
        HttpStatus.BAD_GATEWAY,
      );
    }

    const text = await upstream.text();
    let payload: unknown = text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    } else {
      payload = null;
    }

    if (!upstream.ok) {
      // Propagate upstream status/body so client sees real auth errors
      throw new HttpException(
        payload && typeof payload === "object"
          ? payload
          : { message: text || upstream.statusText },
        upstream.status,
      );
    }

    return payload;
  }
}
