import { ImageGen } from "@/components/canvas/nodes/ImageGen";
import { generateImage } from "@/utils/api";
import { userFacingGenerationError } from "@/utils/userFacingError";

export type ImageGenBatchParams = {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  aspectRatio?: string;
  /** Reference images as File[] (same as single generateImage call). */
  images?: File[];
  /** Desired number of independent generation tasks (each uses n=1). */
  n?: number;
};

export type ImageGenBatchResult = {
  nodes: any[];
  /** Per-node errors; empty string if that task started OK. */
  errors: string[];
  successCount: number;
};

function clampCount(n: unknown, max = 16): number {
  const raw = Math.floor(Number(n));
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(max, raw);
}

/**
 * Start `n` independent image-generation tasks (each API call uses n=1).
 * The first uses the existing ImageGen node; extra nodes are created beside it.
 *
 * Why: many upstream providers ignore or reject the `n` batch parameter, so we
 * fan out client-side into separate canvas tasks instead.
 */
export async function startImageGenBatch(options: {
  sourceNode: any;
  params: ImageGenBatchParams;
  maxCount?: number;
}): Promise<ImageGenBatchResult> {
  const source = options.sourceNode;
  if (!source) throw new Error("Missing ImageGen source node");

  const parent = source.parent;
  if (!parent) throw new Error("ImageGen node is not on the canvas");

  const count = clampCount(options.params.n, options.maxCount ?? 16);
  const w = Number(source.width) > 0 ? Number(source.width) : 400;
  const h = Number(source.height) > 0 ? Number(source.height) : 300;
  const gap = 24;
  const baseX = Number(source.x) || 0;
  const baseY = Number(source.y) || 0;

  const sharedImages = Array.isArray(source.images) ? source.images : [];
  const preserveGeneratedLayout = source.preserveGeneratedLayout === true;

  // Sync settings onto the primary node; each task is still a single image.
  source.set?.({
    prompt: options.params.prompt,
    model: options.params.model,
    size: options.params.size,
    quality: options.params.quality,
    aspectRatio: options.params.aspectRatio,
    n: count,
    generationStatus: "generating",
    errorMessage: "",
  });

  const nodes: any[] = [source];
  const sourceIndex =
    typeof parent.children?.indexOf === "function"
      ? parent.children.indexOf(source)
      : -1;

  for (let i = 1; i < count; i++) {
    const sibling = new ImageGen({
      x: baseX + i * (w + gap),
      y: baseY,
      width: w,
      height: h,
      prompt: options.params.prompt,
      model: options.params.model,
      size: options.params.size,
      quality: options.params.quality,
      aspectRatio: options.params.aspectRatio,
      images: [...sharedImages],
      generationStatus: "generating",
      editable: true,
      preserveGeneratedLayout,
    });
    // Keep UI "count" preference on clones for display consistency
    sibling.set?.({ n: count });

    if (sourceIndex >= 0 && typeof parent.addAt === "function") {
      parent.addAt(sibling, sourceIndex + i);
    } else {
      parent.add(sibling);
    }
    nodes.push(sibling);
  }

  const payloadBase: Record<string, unknown> = {
    prompt: options.params.prompt,
    model: options.params.model,
    size: options.params.size,
    quality: options.params.quality,
    aspectRatio: options.params.aspectRatio,
    n: 1,
  };
  if (options.params.images && options.params.images.length > 0) {
    payloadBase.images = options.params.images;
  }

  // Fire all tasks in parallel — each provider call is a single image (n=1).
  const settled = await Promise.allSettled(
    nodes.map(async (node) => {
      const res = await generateImage(payloadBase as any);
      if (!res?.taskId) throw new Error("No taskId returned from API");
      node.set?.({
        taskId: res.taskId,
        generationStatus: "generating",
        errorMessage: "",
      });
      // Bubbles to useCanvas polling listeners (also for newly added siblings).
      node.emit?.("task-start", { bubbles: true });
      return res.taskId as string;
    }),
  );

  const errors = settled.map((result) => {
    if (result.status === "fulfilled") return "";
    const reason = result.reason as any;
    console.error("[startImageGenBatch] task start failed:", reason);
    return userFacingGenerationError(reason, "生成失败，请稍后重试");
  });

  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      nodes[index]?.set?.({
        generationStatus: "error",
        errorMessage: errors[index],
      });
    }
  });

  const successCount = errors.filter((e) => !e).length;
  if (successCount === 0) {
    throw new Error(errors[0] || "全部生成失败");
  }

  return { nodes, errors, successCount };
}
