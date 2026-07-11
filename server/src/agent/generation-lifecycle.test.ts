import { describe, expect, it } from "bun:test";
import { waitForGenerationTasks } from "./generation-lifecycle";

describe("waitForGenerationTasks", () => {
  it("waits until every task reaches a terminal state", async () => {
    const reads = new Map<string, number>();
    const progress: Array<[number, number]> = [];

    const result = await waitForGenerationTasks(
      [
        { taskId: "image-task", refId: "image-node", kind: "image" },
        { taskId: "video-task", refId: "video-node", kind: "video" },
      ],
      {
        timeoutMs: 1_000,
        pollIntervalMs: 10,
        progressIntervalMs: 10,
        getTaskStatus(taskId) {
          const count = (reads.get(taskId) || 0) + 1;
          reads.set(taskId, count);
          if (taskId === "image-task" && count >= 2) {
            return { status: "success", imageUrl: "/files/image.png" };
          }
          if (taskId === "video-task" && count >= 3) {
            return { status: "error", error: "provider failed" };
          }
          return { status: "generating" };
        },
        onProgress: (completed, total) => progress.push([completed, total]),
      },
    );

    expect(result).toEqual([
      {
        taskId: "image-task",
        refId: "image-node",
        kind: "image",
        status: "success",
        state: { status: "success", imageUrl: "/files/image.png" },
      },
      {
        taskId: "video-task",
        refId: "video-node",
        kind: "video",
        status: "error",
        state: { status: "error", error: "provider failed" },
        error: "provider failed",
      },
    ]);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it("deduplicates task ids and reports a bounded timeout", async () => {
    const result = await waitForGenerationTasks(
      [
        { taskId: "same-task", refId: "old-node", kind: "image" },
        { taskId: "same-task", refId: "current-node", kind: "image" },
      ],
      {
        timeoutMs: 60,
        pollIntervalMs: 10,
        getTaskStatus: () => ({ status: "generating" }),
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.refId).toBe("current-node");
    expect(result[0]?.status).toBe("timeout");
  });

  it("stops waiting when the agent run is aborted", async () => {
    const controller = new AbortController();
    const promise = waitForGenerationTasks(
      [{ taskId: "slow-task", refId: "node", kind: "image" }],
      {
        timeoutMs: 1_000,
        pollIntervalMs: 100,
        abortSignal: controller.signal,
        getTaskStatus: () => ({ status: "generating" }),
      },
    );

    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
