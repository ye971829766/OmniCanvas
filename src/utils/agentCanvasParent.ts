const AGENT_CANVAS_CONTAINER_TAGS = new Set(["Frame", "Group"]);

export function isAgentCanvasContainer(node: any): boolean {
  if (!node || typeof node.add !== "function") return false;
  const tag = String(node.tag || node.__tag || "");
  return AGENT_CANVAS_CONTAINER_TAGS.has(tag);
}

export function resolveAgentCanvasParent(
  parentId: string | undefined,
  requestedParent: any,
  fallbackParent: any,
): any | null {
  if (!parentId) return null;
  if (requestedParent) {
    return isAgentCanvasContainer(requestedParent) ? requestedParent : null;
  }
  return isAgentCanvasContainer(fallbackParent) ? fallbackParent : null;
}
