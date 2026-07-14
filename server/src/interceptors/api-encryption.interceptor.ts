import { Injectable } from "@nestjs/common";
import type { NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { encryptData, isApiCryptoEnabled } from "../utils/api-crypto";

@Injectable()
export class ApiEncryptionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    // Internal loopback must stay plaintext for the gateway to re-wrap once
    if (req.headers["x-internal-forward"] === "1") {
      return next.handle();
    }

    const isClientEncrypted = req.headers["x-api-crypto"] === "true";
    const shouldEncrypt = isApiCryptoEnabled() && isClientEncrypted;

    return next.handle().pipe(
      map((data) => {
        if (!shouldEncrypt) return data;

        const contentType = String(res.getHeader("Content-Type") || "");
        if (
          contentType.includes("text/event-stream") ||
          String(req.headers.accept || "").includes("text/event-stream")
        ) {
          return data;
        }

        // Already wrapped
        if (data && typeof data === "object" && "encrypted" in data && Object.keys(data).length === 1) {
          res.setHeader("X-API-Crypto", "true");
          return data;
        }

        if (data !== undefined && data !== null) {
          res.setHeader("X-API-Crypto", "true");
          return { encrypted: encryptData(JSON.stringify(data)) };
        }
        return data;
      }),
    );
  }
}
