export interface AgentMediaNodeState {
  refId: string;
  type: string;
  status: "generating" | "done" | "error";
  url?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface MediaPixelSize {
  width: number;
  height: number;
}

function positivePixel(value: unknown): number | undefined {
  const pixel = Number(value);
  return Number.isFinite(pixel) && pixel > 0 ? Math.round(pixel) : undefined;
}

/**
 * Resolve the final canvas box for generated media. Root-level generated
 * images use their actual bitmap pixels; only an explicitly preserved layout
 * (for example a fixed frame slot) keeps the placeholder box.
 */
export function resolveGeneratedImageCanvasSize(
  placeholder: Partial<MediaPixelSize> | undefined,
  natural: Partial<MediaPixelSize> | undefined,
  preserveLayout: boolean,
): MediaPixelSize {
  const fallback = {
    width: positivePixel(placeholder?.width) ?? 1024,
    height: positivePixel(placeholder?.height) ?? 1024,
  };
  if (preserveLayout) return fallback;
  const naturalWidth = positivePixel(natural?.width);
  const naturalHeight = positivePixel(natural?.height);
  return naturalWidth && naturalHeight
    ? { width: naturalWidth, height: naturalHeight }
    : fallback;
}

const MEDIA_TOOL_NAMES = new Set([
  "generate_image",
  "generate_video",
  "edit_image",
  "remove_background",
  "inpaint_image",
  "upscale_image",
  "export_node_image",
]);

const API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL) ||
  "http://localhost:3000";

function unwrapToolOutput(value: any): any {
  if (
    value &&
    typeof value === "object" &&
    (value.type === "json" || value.type === "text") &&
    "value" in value
  ) {
    return value.value;
  }
  return value;
}

/**
 * Normalize media URLs so chat <img> tags load against the API host.
 * Handles relative /files/... paths and absolute file URLs that used a
 * different host than VITE_API_BASE_URL (localhost vs 127.0.0.1, etc.).
 */
export function resolveMediaDisplayUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("/files/") || trimmed.startsWith("files/")) {
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${String(API_BASE_URL).replace(/\/$/, "")}${path}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith("/files/")) {
      const base = new URL(String(API_BASE_URL), "http://localhost:3000");
      return `${base.origin}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* keep raw */
  }
  return trimmed;
}

/** Convert an authoritative terminal media tool result into live canvas/chat state. */
export function deriveTerminalMediaNodeState(
  toolName: string,
  rawOutput: unknown,
  previous?: Partial<AgentMediaNodeState>,
): AgentMediaNodeState | undefined {
  if (!MEDIA_TOOL_NAMES.has(toolName)) return undefined;
  const output = unwrapToolOutput(rawOutput);
  const refId = typeof output?.refId === "string" ? output.refId : "";
  if (!refId) return undefined;

  const status = String(output?.status || "").toLowerCase();
  const videoUrl = output?.videoUrl || (toolName === "generate_video" ? output?.url : undefined);
  const imageUrl = output?.imageUrl || (toolName === "generate_video" ? undefined : output?.url);
  const rawUrl =
    toolName === "generate_video"
      ? videoUrl || output?.url || previous?.url
      : imageUrl || output?.url || output?.videoUrl || previous?.url;
  const url = resolveMediaDisplayUrl(rawUrl || "") || rawUrl || undefined;
  const type = toolName === "generate_video" ? "video" : "image";
  const hasTerminalSuccess = ["success", "done", "completed"].includes(status);
  const hasExplicitMediaUrl = Boolean(
    output?.url || output?.imageUrl || output?.videoUrl,
  );

  // Require a renderable URL before marking done. Status-only "success" without
  // pixels produces black broken thumbnails in the agent gallery.
  if (url && (hasTerminalSuccess || hasExplicitMediaUrl)) {
    const thumbnailUrl =
      resolveMediaDisplayUrl(
        output?.thumbnailUrl ||
          previous?.thumbnailUrl ||
          (type === "image" ? url : undefined),
      ) || undefined;
    return {
      ...previous,
      refId,
      type,
      status: "done",
      url,
      thumbnailUrl,
      error: undefined,
    };
  }

  if (
    output?.error ||
    ["error", "failed", "cancelled", "canceled", "timeout"].includes(status)
  ) {
    return {
      ...previous,
      refId,
      type,
      status: "error",
      error: String(output?.error || "Media generation failed"),
    };
  }

  return undefined;
}

/** Build a finished media state from a known refId + URL (canvas poll path). */
export function mediaReadyNodeState(
  refId: string,
  kind: "image" | "video",
  url: string,
  thumbnailUrl?: string,
): AgentMediaNodeState {
  const resolved = resolveMediaDisplayUrl(url) || url;
  return {
    refId,
    type: kind,
    status: "done",
    url: resolved,
    thumbnailUrl:
      resolveMediaDisplayUrl(thumbnailUrl || (kind === "image" ? resolved : "")) ||
      undefined,
    error: undefined,
  };
}
