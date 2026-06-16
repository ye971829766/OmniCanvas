import { Catch, HttpException } from '@nestjs/common';
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resBody = exception.getResponse();
      
      if (typeof resBody === 'object' && resBody !== null) {
        response.status(status).json(resBody);
      } else {
        response.status(status).json({ error: resBody });
      }
      return;
    }

    const message = exception instanceof Error ? exception.message : 'Internal server error';
    response.status(500).json({ error: message });
  }
}
