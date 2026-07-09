import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { decryptData } from '../utils/api-crypto';

@Injectable()
export class ApiDecryptionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const isCryptoEnabled = process.env.API_CRYPTO === 'true';
    if (
      isCryptoEnabled &&
      req.headers['x-api-crypto'] === 'true' &&
      req.body &&
      typeof req.body === 'object' &&
      req.body.encrypted
    ) {
      try {
        const decryptedStr = decryptData(req.body.encrypted);
        req.body = JSON.parse(decryptedStr);
      } catch (err) {
        console.error('[ApiDecryptionMiddleware] Failed to decrypt request:', err);
      }
    }
    next();
  }
}
