import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AgentService } from './agent.service';
import { AgentMemory } from './agent.memory';

@Controller('agent')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly memory: AgentMemory,
  ) {}

  private getOrigin(req: Request): string {
    const host = req.headers['host'] || 'localhost:3000';
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    return `${protocol}://${host}`;
  }

  /** Write the SSE stream from an EventSink to the response. */
  private async pipe(res: Response, stream: AsyncGenerator<any>) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();
    for await (const event of stream) {
      if (event.type === 'keepalive') {
        // SSE comment — keeps connection alive, EventSource ignores it
        res.write(`: keepalive\n\n`);
      } else {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    }
    res.end();
  }

  /**
   * GET /agent/:sessionId/stream?message=...
   * EventSource-friendly (browser EventSource only does GET).
   */
  /**
   * POST /agent/:sessionId/chat  { message }
   * Preferred: send the message in the body, parse the SSE response yourself
   * via fetch + ReadableStream.
   */
  @Post(':sessionId/chat')
  async chat(
    @Param('sessionId') sessionId: string,
    @Body() body: { message: string; images?: string[] },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sink = this.agent.run(
      sessionId,
      body?.message ?? '',
      this.getOrigin(req),
      body?.images,
    );
    await this.pipe(res, sink.stream());
  }

  /**
   * GET /agent/:sessionId/stream?message=...
   * EventSource-friendly (browser EventSource only supports GET).
   */
  @Get(':sessionId/stream')
  async stream(
    @Param('sessionId') sessionId: string,
    @Query('message') message: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sink = this.agent.run(sessionId, message ?? '', this.getOrigin(req));
    await this.pipe(res, sink.stream());
  }

  @Delete(':sessionId')
  reset(@Param('sessionId') sessionId: string): { ok: true } {
    this.memory.reset(sessionId);
    return { ok: true };
  }

  @Post(':sessionId/screenshot')
  uploadScreenshot(
    @Param('sessionId') sessionId: string,
    @Body() body: { image: string },
  ): { ok: true } {
    this.memory.setScreenshot(sessionId, body.image);
    return { ok: true };
  }
}
