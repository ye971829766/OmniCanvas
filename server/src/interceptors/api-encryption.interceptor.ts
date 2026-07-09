import { Injectable } from '@nestjs/common';
import type { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { encryptData } from '../utils/api-crypto';

@Injectable()
export class ApiEncryptionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const isCryptoEnabled = process.env.API_CRYPTO === 'true';
    const isClientEncrypted = req.headers['x-api-crypto'] === 'true';

    return next.handle().pipe(
      map((data) => {
        if (!isCryptoEnabled || !isClientEncrypted) {
          return data;
        }

        // Skip encryption for EventStream or non-object/non-array data
        const contentType = res.getHeader('Content-Type') || '';
        if (
          contentType.includes('text/event-stream') ||
          req.headers['accept']?.includes('text/event-stream')
        ) {
          return data;
        }

        if (data !== undefined && data !== null) {
          res.setHeader('X-API-Crypto', 'true');
          const encrypted = encryptData(JSON.stringify(data));
          return { encrypted };
        }
        return data;
      })
    );
  }
}
