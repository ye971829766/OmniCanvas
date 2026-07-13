import type { ToolContext } from "../agent/tool.interface";
import type { BillingOperationType, BillingQuoteParams, BillingTaskContext } from "./billing.types";

export async function startBilledAgentTask<T extends { taskId?: string }>(
  ctx: ToolContext,
  operation: BillingOperationType,
  params: BillingQuoteParams,
  start: (billingContext?: BillingTaskContext) => Promise<T>,
): Promise<{ result: T; billingOperationId?: string }> {
  // Unit tests and trusted internal maintenance calls may construct a partial
  // ToolContext. HTTP production paths always provide both through AuthGuard.
  if (!ctx.billing || !ctx.userId) return { result: await start() };

  const toolCallId = ctx.billingToolCallId || ctx.newRefId("billing");
  const reservation = ctx.billing.reserve({
    userId: ctx.userId,
    idempotencyKey: `${ctx.billingNamespace}:tool:${toolCallId}`,
    operation,
    params,
    metadata: { source: "agent", sessionId: ctx.sessionId, toolCallId },
  });
  if (reservation.reused) {
    if (reservation.taskId) {
      return {
        result: {
          taskId: reservation.taskId,
          status: reservation.status === "released" ? "error" : "generating",
        } as unknown as T,
        billingOperationId: reservation.id,
      };
    }
    throw new Error("Idempotent Agent operation exists without an attached task");
  }

  try {
    const result = await start({ operationId: reservation.id, userId: ctx.userId });
    if (!result.taskId) throw new Error(`${operation} did not return a task id`);
    ctx.billing.attachTask(reservation.id, result.taskId, ctx.userId);
    return { result, billingOperationId: reservation.id };
  } catch (error: any) {
    ctx.billing.release(reservation.id, error?.message || `Failed to start ${operation}`);
    throw error;
  }
}
