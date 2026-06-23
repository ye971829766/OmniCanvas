import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AgentService } from './agent.service';
import { AgentMemory } from './agent.memory';
import { exportRegistry } from './export-registry';

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
    @Body() body: { message: string; images?: string[]; canvasState?: any[] },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sink = this.agent.run(
      sessionId,
      body?.message ?? '',
      this.getOrigin(req),
      body?.images,
      body?.canvasState,
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

  @Post(':sessionId/stop')
  stop(@Param('sessionId') sessionId: string): { ok: true; stopped: boolean } {
    return { ok: true, stopped: this.agent.stop(sessionId) };
  }

  @Get(':sessionId/history')
  getHistory(@Param('sessionId') sessionId: string) {
    const raw = this.memory.get(sessionId) || [];
    return this.transformToLegacyFormat(raw);
  }


  @Get('sessions/all')
  getAllSessions() {
    const list = this.memory.getAllSessions();
    return list.map((entry) => ({
      sessionId: entry.sessionId,
      messageCount: entry.messages.length,
      messages: entry.messages.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.slice(0, 100) : m.content,
        tool_calls: m.tool_calls || m.toolCalls,
      })),
      lastAccess: entry.lastAccess,
    }));
  }


  @Post(':sessionId/screenshot')
  uploadScreenshot(
    @Param('sessionId') sessionId: string,
    @Body() body: { image: string },
  ): { ok: true } {
    this.memory.setScreenshot(sessionId, body.image);
    return { ok: true };
  }

  @Post('export-result')
  submitExportResult(
    @Body() body: { requestId: string; imageBase64: string },
  ): { ok: true } {
    exportRegistry.set(body.requestId, body.imageBase64);
    return { ok: true };
  }

  @Post('generation-callback')
  generationCallback(
    @Body() body: { refId: string; status: 'done' | 'error'; url?: string; error?: string },
  ): { ok: true } {
    this.agent.updateGenerationState(body.refId, body.status, body.url, body.error);
    return { ok: true };
  }

  private transformToLegacyFormat(messages: any[]): any[] {
    const result: any[] = [];
    for (const msg of messages) {
      if (msg.role === 'user') {
        let content: any = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = msg.content.map((part: any) => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            } else if (part.type === 'image') {
              return {
                type: 'image_url',
                image_url: { url: part.image }
              };
            }
            return part;
          });
        }
        result.push({
          role: 'user',
          content
        });
      } else if (msg.role === 'assistant') {
        let textContent = '';
        const toolCalls: any[] = [];
        if (typeof msg.content === 'string') {
          textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'text') {
              textContent += part.text;
            } else if (part.type === 'tool-call') {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input ?? {})
                }
              });
            }
          }
        }
        result.push({
          role: 'assistant',
          content: textContent,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
        });
      } else if (msg.role === 'tool') {
        if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-result') {
              const val = part.output?.value ?? part.output ?? {};
              result.push({
                role: 'tool',
                tool_call_id: part.toolCallId,
                name: part.toolName,
                content: typeof val === 'string' ? val : JSON.stringify(val)
              });
            }
          }
        } else {
          result.push(msg);
        }
      } else {
        result.push(msg);
      }
    }
    return result;
  }
}

