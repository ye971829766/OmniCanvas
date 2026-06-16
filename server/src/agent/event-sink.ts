import type { AgentEvent, CanvasOp } from './agent.protocol';

/**
 * EventSink — a tiny async push channel. AgentService creates one per turn and
 * passes it to tools so they can emit canvas ops / progress while running.
 * The controller drains .stream() and writes each event as SSE.
 *
 * Includes a keepalive heartbeat that prevents intermediary proxies (nginx,
 * cloud LB) from closing the SSE connection during long-running tool calls.
 */
export class EventSink {
  private queue: AgentEvent[] = [];
  private resolvers: ((v: IteratorResult<AgentEvent>) => void)[] = [];
  private closed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Keepalive interval in ms (default 15 s). */
  private readonly HEARTBEAT_MS = 15_000;

  constructor() {
    this.startHeartbeat();
  }

  emit(event: AgentEvent): void {
    if (this.closed) return;
    const r = this.resolvers.shift();
    if (r) r({ value: event, done: false });
    else this.queue.push(event);
  }

  canvas(op: CanvasOp): void {
    this.emit({ type: 'canvas_op', op });
  }

  close(): void {
    this.stopHeartbeat();
    this.closed = true;
    let r: ((v: IteratorResult<AgentEvent>) => void) | undefined;
    while ((r = this.resolvers.shift())) {
      r({ value: undefined as any, done: true });
    }
  }

  async *stream(): AsyncGenerator<AgentEvent> {
    while (true) {
      if (this.queue.length) {
        yield this.queue.shift()!;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<AgentEvent>>((resolve) =>
        this.resolvers.push(resolve),
      );
      if (result.done) return;
      yield result.value;
    }
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) {
        this.stopHeartbeat();
        return;
      }
      // Emit a lightweight keepalive; the controller writes it as an SSE
      // comment (`: keepalive\n\n`) which EventSource silently ignores.
      this.emit({ type: 'keepalive' } as any);
    }, this.HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
