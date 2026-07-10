export type LayerDropMode = "above" | "inside" | "below";

export interface LayerTreeItem {
  id: string;
  node: any;
  parentId: string | null;
  depth: number;
  tag: string;
  name: string;
  isContainer: boolean;
  hasChildren: boolean;
  childCount: number;
  visible: boolean;
  locked: boolean;
  effectivelyHidden: boolean;
  effectivelyLocked: boolean;
  matchesSearch: boolean;
}

export interface LayerTreeResult {
  items: LayerTreeItem[];
  byId: Map<string, LayerTreeItem>;
  total: number;
}

interface LayerNodePlacement {
  node: any;
  parent: any;
  index: number;
  transform: any;
  nextTransform: any;
}

interface InternalLayerTreeItem extends LayerTreeItem {
  children: InternalLayerTreeItem[];
  branchMatches: boolean;
}

const CONTAINER_TAGS = new Set(["Frame", "Group", "Box"]);
const EXCLUDED_TAGS = new Set([
  "App",
  "Leafer",
  "Editor",
  "EditBox",
  "SimulateElement",
]);

const DEFAULT_NAMES: Record<string, string> = {
  Box: "容器",
  Ellipse: "椭圆",
  Frame: "画板",
  Group: "编组",
  Image: "图片",
  ImageGen: "图片生成",
  Line: "线段",
  Path: "路径",
  Pen: "画笔",
  Polygon: "多边形",
  Rect: "矩形",
  Star: "星形",
  Text: "文本",
  VideoGen: "视频生成",
  VideoNode: "视频",
};

export function getLayerNodeId(node: any): string {
  return String(
    node?.__historyId ?? node?.refId ?? node?.innerId ?? node?.id ?? "",
  );
}

export function isSameLayerNode(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || a.innerId == null || b.innerId == null) return false;
  return String(a.innerId) === String(b.innerId);
}

export function getLayerTag(node: any): string {
  return String(node?.tag || node?.__tag || "Layer");
}

export function getLayerDisplayName(node: any): string {
  const name = typeof node?.name === "string" ? node.name.trim() : "";
  if (name) return name;
  const tag = getLayerTag(node);
  return DEFAULT_NAMES[tag] || tag || "未命名图层";
}

export function isLayerContainer(node: any): boolean {
  return CONTAINER_TAGS.has(getLayerTag(node));
}

export function isExcludedLayerNode(node: any): boolean {
  const tag = getLayerTag(node);
  return (
    !node ||
    EXCLUDED_TAGS.has(tag) ||
    node.className === "Editor" ||
    node.isCropOverlay ||
    node.isTaskOverlay
  );
}

export function buildLayerTree(
  root: any,
  collapsedIds: ReadonlySet<string>,
  searchQuery = "",
): LayerTreeResult {
  const query = searchQuery.trim().toLocaleLowerCase();
  const byId = new Map<string, LayerTreeItem>();

  const visit = (
    node: any,
    depth: number,
    parentId: string | null,
    ancestorHidden: boolean,
    ancestorLocked: boolean,
  ): InternalLayerTreeItem | null => {
    if (isExcludedLayerNode(node)) return null;

    const id = getLayerNodeId(node);
    if (!id) return null;
    const tag = getLayerTag(node);
    const name = getLayerDisplayName(node);
    const isContainer = isLayerContainer(node);
    const visible = node.visible !== false;
    const locked = node.locked === true;
    const effectivelyHidden = ancestorHidden || !visible;
    const effectivelyLocked = ancestorLocked || locked;
    const children = isContainer
      ? [...(node.children || [])]
          .reverse()
          .map((child) =>
            visit(
              child,
              depth + 1,
              id,
              effectivelyHidden,
              effectivelyLocked,
            ),
          )
          .filter((child): child is InternalLayerTreeItem => !!child)
      : [];
    const matchesSearch =
      !query ||
      name.toLocaleLowerCase().includes(query) ||
      tag.toLocaleLowerCase().includes(query);
    const branchMatches =
      matchesSearch || children.some((child) => child.branchMatches);

    const item: InternalLayerTreeItem = {
      id,
      node,
      parentId,
      depth,
      tag,
      name,
      isContainer,
      hasChildren: children.length > 0,
      childCount: children.length,
      visible,
      locked,
      effectivelyHidden,
      effectivelyLocked,
      matchesSearch,
      children,
      branchMatches,
    };
    byId.set(id, item);
    return item;
  };

  const roots = [...(root?.children || [])]
    .reverse()
    .map((child) => visit(child, 0, null, false, false))
    .filter((child): child is InternalLayerTreeItem => !!child);
  const items: LayerTreeItem[] = [];

  const flatten = (item: InternalLayerTreeItem) => {
    if (query && !item.branchMatches) return;
    items.push(item);
    const shouldExpand = query ? item.branchMatches : !collapsedIds.has(item.id);
    if (shouldExpand) item.children.forEach(flatten);
  };
  roots.forEach(flatten);

  return { items, byId, total: byId.size };
}

export function getLayerSelectionRange(
  items: readonly LayerTreeItem[],
  anchorId: string,
  targetId: string,
): string[] {
  const anchorIndex = items.findIndex((item) => item.id === anchorId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (anchorIndex < 0 || targetIndex < 0) return [targetId];
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return items.slice(start, end + 1).map((item) => item.id);
}

export function getLayerDropIndex(
  children: readonly any[],
  target: any,
  mode: Exclude<LayerDropMode, "inside">,
  movingNodes: ReadonlySet<any>,
): number {
  const remaining = children.filter((child) => !movingNodes.has(child));
  const targetIndex = remaining.indexOf(target);
  if (targetIndex < 0) return remaining.length;
  return mode === "above" ? targetIndex + 1 : targetIndex;
}

export function hasLayerAncestorInSet(
  node: any,
  nodes: ReadonlySet<any>,
  root: any,
): boolean {
  let current = node?.parent;
  const visited = new Set<any>();
  while (current && current !== root) {
    if (visited.has(current)) return true;
    visited.add(current);
    if (nodes.has(current)) return true;
    current = current.parent;
  }
  return false;
}

export function isLayerDescendant(node: any, ancestor: any): boolean {
  let current = node?.parent;
  const visited = new Set<any>();
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    if (isSameLayerNode(current, ancestor)) return true;
    current = current.parent;
  }
  return false;
}

export function isFlowLayoutContainer(node: any): boolean {
  return (
    node?.flow === true ||
    node?.flow === "x" ||
    node?.flow === "y" ||
    node?.flow === "x-reverse" ||
    node?.flow === "y-reverse"
  );
}

export function isFiniteLayerTransform(transform: any): boolean {
  if (!transform || typeof transform !== "object") return false;
  return ["a", "b", "c", "d", "e", "f"].every((key) =>
    Number.isFinite(transform[key]),
  );
}

function isFiniteLayerBounds(bounds: any): boolean {
  return (
    bounds &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height)
  );
}

function layerBoundsContainPoint(bounds: any, point: any): boolean {
  return (
    isFiniteLayerBounds(bounds) &&
    Number.isFinite(point?.x) &&
    Number.isFinite(point?.y) &&
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function findFrameDropTarget(
  root: any,
  nodes: readonly any[],
  dropPoint?: { x: number; y: number },
): any | null {
  if (!root || !nodes.length) return null;
  const movingNodes = new Set(nodes);
  const centers = nodes
    .map((node) => node?.worldBoxBounds)
    .filter(isFiniteLayerBounds)
    .map((bounds) => ({
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    }));
  if (centers.length !== nodes.length) return null;

  let bestNode: any = null;
  let bestDepth = -1;
  let bestArea = Number.POSITIVE_INFINITY;
  const visited = new Set<any>();
  const visit = (node: any, depth: number) => {
    if (!node || visited.has(node) || movingNodes.has(node)) return;
    visited.add(node);

    if (
      getLayerTag(node) === "Frame" &&
      node.visible !== false &&
      node.locked !== true &&
      !nodes.some((movingNode) => isLayerDescendant(node, movingNode))
    ) {
      const bounds = node.worldBoxBounds;
      const containsDropPoint = layerBoundsContainPoint(bounds, dropPoint);
      const containsNodeCenters = centers.every((center) =>
        layerBoundsContainPoint(bounds, center),
      );
      if (containsDropPoint || containsNodeCenters) {
        const area = Math.abs(bounds.width * bounds.height);
        if (
          depth > bestDepth ||
          (depth === bestDepth && area < bestArea)
        ) {
          bestNode = node;
          bestDepth = depth;
          bestArea = area;
        }
      }
    }

    node.children?.forEach((child: any) => visit(child, depth + 1));
  };
  root.children?.forEach((child: any) => visit(child, 0));
  return bestNode;
}

function insertLayerNode(parent: any, node: any, index: number) {
  const safeIndex = Math.max(0, Math.min(index, parent.children?.length ?? 0));
  if (typeof parent.addAt === "function") parent.addAt(node, safeIndex);
  else parent.add(node, safeIndex);
}

function restoreLayerPlacements(placements: LayerNodePlacement[]) {
  placements.forEach(({ node }) => node.parent && node.remove());

  const parents = new Map<any, LayerNodePlacement[]>();
  placements.forEach((placement) => {
    const siblings = parents.get(placement.parent) || [];
    siblings.push(placement);
    parents.set(placement.parent, siblings);
  });

  parents.forEach((siblings, parent) => {
    siblings
      .sort((a, b) => a.index - b.index)
      .forEach(({ node, index, transform }) => {
        node.setTransform(transform);
        insertLayerNode(parent, node, index);
      });
  });
}

/**
 * Reparents nodes without leaving a partially-mutated scene tree behind.
 * Transforms are applied before insertion so flow containers can own x/y during layout.
 */
export function moveLayerNodesWithRollback(
  app: any,
  nodes: readonly any[],
  newParent: any,
  insertionIndex: number,
): boolean {
  if (!app || !newParent || !nodes.length) return false;
  if (new Set(nodes).size !== nodes.length) return false;
  if (
    nodes.some(
      (node) =>
        !node?.parent ||
        isSameLayerNode(node, newParent) ||
        isLayerDescendant(newParent, node),
    )
  ) {
    return false;
  }

  let placements: LayerNodePlacement[];
  try {
    placements = nodes.map((node) => {
      const parent = node.parent;
      const transform = node.getTransform();
      const nextTransform = node.getTransform(newParent);
      if (
        !isFiniteLayerTransform(transform) ||
        !isFiniteLayerTransform(nextTransform) ||
        parent.children.indexOf(node) < 0
      ) {
        throw new Error("Invalid layer transform");
      }
      return {
        node,
        parent,
        index: parent.children.indexOf(node),
        transform,
        nextTransform,
      };
    });
  } catch (error) {
    console.error("[LayerPanel] Unable to prepare layer move", error);
    return false;
  }

  let locked = false;
  let moved = false;
  try {
    app.lockLayout();
    locked = true;
    app.isReordering = true;

    placements.forEach(({ node }) => node.remove());
    let nextIndex = Math.max(
      0,
      Math.min(insertionIndex, newParent.children?.length ?? 0),
    );
    placements.forEach(({ node, nextTransform }) => {
      node.setTransform(nextTransform);
      insertLayerNode(newParent, node, nextIndex++);
      if (!isSameLayerNode(node.parent, newParent)) {
        throw new Error(
          `Layer was attached to ${getLayerDisplayName(node.parent)} (${node.parent?.innerId ?? "no-id"}) instead of ${getLayerDisplayName(newParent)} (${newParent?.innerId ?? "no-id"})`,
        );
      }
    });
    moved = true;
  } catch (error) {
    console.error("[LayerPanel] Layer move failed; restoring scene tree", error);
    try {
      restoreLayerPlacements(placements);
    } catch (rollbackError) {
      console.error("[LayerPanel] Layer move rollback failed", rollbackError);
    }
  } finally {
    app.isReordering = false;
    if (locked) app.unlockLayout();
  }

  return moved;
}
