import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ExceptionFilter, ArgumentsHost } from "@nestjs/common";
import type { Request, Response } from "express";
import { encryptData, isApiCryptoEnabled } from "./utils/api-crypto";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let clientBody: Record<string, unknown> = {
      statusCode: status,
      message: "服务暂时不可用，请稍后再试",
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resBody = exception.getResponse();
      if (typeof resBody === "string") {
        clientBody = { statusCode: status, message: resBody };
      } else if (typeof resBody === "object" && resBody !== null) {
        const obj = resBody as Record<string, unknown>;
        const message = this.sanitizeMessage(obj.message ?? obj.error, status);
        clientBody = {
          statusCode: status,
          message,
          ...(typeof obj.retryAfter === "number" ? { retryAfter: obj.retryAfter } : {}),
        };
      }
    } else {
      // Never leak stack / SQL / crypto internals to clients
      this.logger.error(
        exception instanceof Error ? exception.stack || exception.message : String(exception),
      );
      clientBody = {
        statusCode: 500,
        message: "服务暂时不可用，请稍后再试",
      };
    }

    // If client asked for encrypted API mode, wrap error the same way
    const wantsCrypto =
      isApiCryptoEnabled() &&
      request.headers["x-api-crypto"] === "true" &&
      request.headers["x-internal-forward"] !== "1";

    if (wantsCrypto) {
      try {
        response.setHeader("X-API-Crypto", "true");
        response.status(status).json({
          encrypted: encryptData(JSON.stringify(clientBody)),
        });
        return;
      } catch {
        // fall through to plain JSON
      }
    }

    response.status(status).json(clientBody);
  }

  private sanitizeMessage(message: unknown, status: number): string {
    if (status >= 500) return this.fallbackForStatus(status);

    if (Array.isArray(message)) {
      const joined = message.map(String).filter(Boolean).join("；");
      return this.looksTechnical(joined)
        ? this.fallbackForStatus(status)
        : joined.slice(0, 200);
    }
    if (typeof message === "string" && message.trim()) {
      if (this.looksTechnical(message)) return this.fallbackForStatus(status);
      return message.slice(0, 200);
    }
    return this.fallbackForStatus(status);
  }

  private looksTechnical(msg: string): boolean {
    return /cannot read|undefined|ECONN|sqlite|stack|TypeError|at\s+\S+\s+\(|AES|ciphertext|encrypt|decrypt/i.test(
      msg,
    );
  }

  private fallbackForStatus(status: number): string {
    if (status === 401) return "登录已失效，请重新登录";
    if (status === 403) return "没有权限执行此操作";
    if (status === 404) return "请求的内容不存在";
    if (status === 429) return "操作过于频繁，请稍后再试";
    if (status >= 500) return "服务暂时不可用，请稍后再试";
    return "请求失败，请稍后重试";
  }
}
