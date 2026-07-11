export interface PendingGenerationTask {
  taskId: string;
  refId: string;
  kind: "image" | "video";
}

export interface GenerationTaskState {
  status?: string;
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
  [key: string]: unknown;
}

export interface SettledGenerationTask extends PendingGenerationTask {
  status: "success" | "error" | "timeout";
  state?: GenerationTaskState;
  error?: string;
}

interface WaitForGenerationTasksOptions {
  getTaskStatus: (taskId: string) => GenerationTaskState;
  abortSignal?: AbortSignal;
  timeoutMs: number;
  pollIntervalMs?: number;
  progressIntervalMs?: number;
  onProgress?: (completed: number, total: number) => void;
}

function abortError(): DOMException {
  return new DOMException("Agent run aborted", "AbortError");
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function normalizeTerminalStatus(status: unknown): "success" | "error" | null {
  const value = String(status || "").toLowerCase();
  if (["success", "done", "completed"].includes(value)) return "success";
  if (["error", "failed", "cancelled", "canceled"].includes(value)) return "error";
  return null;
}

export async function waitForGenerationTasks(
  tasks: PendingGenerationTask[],
  options: WaitForGenerationTasksOptions,
): Promise<SettledGenerationTask[]> {
  const uniqueTasks = [...new Map(tasks.map((task) => [task.taskId, task])).values()];
  if (uniqueTasks.length === 0) return [];

  const pending = new Map(uniqueTasks.map((task) => [task.taskId, task]));
  const settled = new Map<string, SettledGenerationTask>();
  const startedAt = Date.now();
  const pollIntervalMs = Math.max(50, options.pollIntervalMs ?? 1_000);
  const progressIntervalMs = Math.max(100, options.progressIntervalMs ?? 10_000);
  let lastProgressAt = 0;

  while (pending.size > 0) {
    if (options.abortSignal?.aborted) throw abortError();

    for (const task of [...pending.values()]) {
      let state: GenerationTaskState;
      try {
        state = options.getTaskStatus(task.taskId);
      } catch {
        // A freshly-created task can briefly be unavailable to readers. Retry
        // until the lifecycle timeout rather than treating that as completion.
        continue;
      }

      const terminalStatus = normalizeTerminalStatus(state.status);
      if (!terminalStatus) continue;

      settled.set(task.taskId, {
        ...task,
        status: terminalStatus,
        state,
        error: terminalStatus === "error" ? String(state.error || "Generation failed") : undefined,
      });
      pending.delete(task.taskId);
    }

    if (pending.size === 0) break;

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= options.timeoutMs) {
      for (const task of pending.values()) {
        settled.set(task.taskId, {
          ...task,
          status: "timeout",
          error: `Generation task ${task.taskId} timed out after ${options.timeoutMs}ms`,
        });
      }
      pending.clear();
      break;
    }

    if (Date.now() - lastProgressAt >= progressIntervalMs) {
      options.onProgress?.(settled.size, uniqueTasks.length);
      lastProgressAt = Date.now();
    }

    await wait(Math.min(pollIntervalMs, options.timeoutMs - elapsedMs), options.abortSignal);
  }

  options.onProgress?.(settled.size, uniqueTasks.length);
  return uniqueTasks.map((task) => settled.get(task.taskId)!);
}
