export interface AgentMediaNodeState {
  refId: string;
  type: string;
  status: "generating" | "done" | "error";
  url?: string;
  thumbnailUrl?: string;
  error?: string;
}

const MEDIA_TOOL_NAMES = new Set([
  "generate_image",
  "generate_video",
  "edit_image",
  "remove_background",
  "inpaint_image",
  "upscale_image",
]);

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
  const url = output?.url || output?.imageUrl || output?.videoUrl;
  const type = toolName === "generate_video" ? "video" : "image";
  if (url || ["success", "done", "completed"].includes(status)) {
    return {
      ...previous,
      refId,
      type,
      status: "done",
      url: url || previous?.url,
      thumbnailUrl: output?.thumbnailUrl || previous?.thumbnailUrl,
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
