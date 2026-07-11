import { type Ref } from "vue";
import {
  App,
  Rect,
  Ellipse,
  Polygon,
  Star,
  Line,
  Text,
  Group,
  Frame,
  Pen,
  Image,
  Box,
  Path,
} from "leafer-ui";
import { ImageGen } from "@/components/canvas/nodes/ImageGen";
import { VideoGen } from "@/components/canvas/nodes/VideoGen";
import { VideoNode } from "@/components/canvas/nodes/VideoNode";
import { getWorkspaceCanvas, updateWorkspaceCanvas } from "@/utils/api";
import { applyImagePaintMode } from "@/utils/leaferImage";

const tagClassMap: Record<string, any> = {
  Rect,
  Ellipse,
  Polygon,
  Star,
  Line,
  Text,
  Group,
  Frame,
  Pen,
  Image,
  Box,
  Path,
};

// ── 稳定节点 ID ────────────────────────────────────────────────────────────────
let _nextId = 1;

/** 检查数据是否为残留的裁剪框图层（用于自愈被污染的旧数据） */
function isLeftoverCropOverlay(data: any): boolean {
  if (data.tag !== "Group" || !Array.isArray(data.children)) return false;
  if (data.children.length !== 13) return false;
  const strokeMatches = data.children.filter(
    (c: any) => c.stroke === "#10b981",
  ).length;
  const fillMatches = data.children.filter(
    (c: any) => c.fill === "rgba(0,0,0,0.6)",
  ).length;
  return fillMatches === 4 && strokeMatches === 9;
}

/** 检查数据是否为残留的任务加载图层（用于自愈被污染的旧数据） */
function isLeftoverTaskOverlay(data: any): boolean {
  if (data.tag === "Box" && Array.isArray(data.children)) {
    return data.children.some(
      (c: any) =>
        c.tag === "Text" &&
        typeof c.text === "string" &&
        c.text.startsWith("正在"),
    );
  }
  return false;
}

/** 为节点分配一个跨 undo/redo 稳定的 ID */
function ensureHistoryId(node: any): string {
  if (!node.__historyId) {
    node.__historyId = `hid_${_nextId++}_${Math.random().toString(36).slice(2, 6)}`;
  }
  return node.__historyId;
}

/** 递归为节点及其子节点分配 historyId */
function ensureHistoryIdDeep(node: any): void {
  ensureHistoryId(node);
  if (node.children) {
    node.children.forEach(ensureHistoryIdDeep);
  }
}

// ── 用于判定两个序列化对象是否属性相同的比较键 ─────────────────────────────
const COMPARE_KEYS = [
  "name",
  "visible",
  "locked",
  "x",
  "y",
  "width",
  "height",
  "scaleX",
  "scaleY",
  "rotation",
  "skewX",
  "skewY",
  "fill",
  "stroke",
  "strokeWidth",
  "cornerRadius",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "textAlign",
  "lineHeight",
  "letterSpacing",
  "text",
  "opacity",
  "url",
  "prompt",
  "model",
  "size",
  "quality",
  "aspectRatio",
  "seconds",
  "images",
  "inputReference",
  "generationStatus",
  "errorMessage",
  "taskId",
  "videoUrl",
  "thumbnailUrl",
  "flow",
  "flowAlign",
  "flowWrap",
  "gap",
  "padding",
  "lockRatio",
  "editable",
];

/**
 * 增量式画布历史管理。
 *
 * 改进点（相较旧版全量 clone 快照）：
 * 1. 快照使用轻量 JSON 序列化，而非 clone DOM 节点 → 内存 ~10x 降低
 * 2. undo/redo 对属性变化增量还原，对层级变化完整还原 → 正确性与性能兼顾
 * 3. 通过稳定 __historyId 跟踪节点身份 → 精确匹配
 */
interface HistoryState {
  /** 序列化的 JSON 对象数组（非 clone 的 DOM 节点） */
  serialized: any[];
  /** 选中元素的 __historyId */
  selectedHistoryIds: string[];
}

export function useCanvasHistory(
  canvasAppRef: Ref<App | null>,
  activeWorkspaceIdRef?: Ref<string | number | null>,
) {
  const history: HistoryState[] = [];
  let currentIndex = -1;
  let isRestoring = false;
  let debounceTimeout: any = null;
  let saveTimeout: any = null;
  let transactionActive = false;
  let transactionDirty = false;
  let transactionStartState: HistoryState | null = null;

  // ── 序列化 / 反序列化 ──────────────────────────────────────────────────────

  const serializeNode = (node: any): any => {
    ensureHistoryId(node);
    const data = node.toJSON ? node.toJSON() : {};
    data.tag = node.__tag || node.tag;
    data.__historyId = node.__historyId;

    // 保存 refId（供 Agent 使用）
    if (node.refId) {
      data.refId = node.refId;
    }

    // 保存后台异步任务生成状态（支持去背景和局部擦除）
    if (node.taskId) {
      data.taskId = node.taskId;
    }
    if (node.generationStatus) {
      data.generationStatus = node.generationStatus;
    }
    if (node.generationType) {
      data.generationType = node.generationType;
    }

    if (data.tag === "ImageGen") {
      data.prompt = node.prompt;
      data.model = node.model;
      data.size = node.size;
      data.quality = node.quality;
      data.aspectRatio = node.aspectRatio;
      data.generationStatus = node.generationStatus;
      data.errorMessage = node.errorMessage;
      data.taskId = node.taskId;
      data.images = node.images;
      data.preserveGeneratedLayout = node.preserveGeneratedLayout === true;
      delete data.children;
    } else if (data.tag === "VideoGen") {
      data.prompt = node.prompt;
      data.model = node.model;
      data.seconds = node.seconds;
      data.size = node.size;
      data.generationStatus = node.generationStatus;
      data.errorMessage = node.errorMessage;
      data.taskId = node.taskId;
      data.inputReference = node.inputReference;
      delete data.children;
    } else if (data.tag === "VideoNode") {
      data.videoUrl = node.videoUrl;
      data.thumbnailUrl = node.thumbnailUrl;
      data.opacity = 1;
      data.lockRatio = true;
      delete data.children;
    } else if (node.children && node.children.length > 0) {
      data.children = node.children
        .filter(
          (c: any) =>
            c.tag !== "SimulateElement" &&
            c.__tag !== "SimulateElement" &&
            !c.isCropOverlay &&
            !c.isTaskOverlay &&
            !isLeftoverCropOverlay(c) &&
            !isLeftoverTaskOverlay(c),
        )
        .map((c: any) => serializeNode(c));
    }
    return data;
  };

  const deserializeNode = (data: any): any => {
    let child: any = null;
    if (data.tag === "ImageGen") {
      child = new ImageGen(data);
    } else if (data.tag === "VideoGen") {
      child = new VideoGen(data);
    } else if (data.tag === "VideoNode") {
      child = new VideoNode(data);
    } else {
      const childrenData = data.children;
      const dataCopy = { ...data };
      delete dataCopy.children;

      const Constructor = tagClassMap[data.tag];
      if (Constructor) {
        child = new Constructor(dataCopy);
        if (data.tag === "Image") applyImagePaintMode(child);
      } else {
        child = new Group(dataCopy);
      }

      if (child && Array.isArray(childrenData)) {
        childrenData
          .filter((cd: any) => !isLeftoverCropOverlay(cd))
          .forEach((childData: any) => {
            const childNode = deserializeNode(childData);
            if (childNode) {
              child.add(childNode);
            }
          });
      }
    }

    // 统一为反序列化后的节点绑定异步任务属性
    if (child) {
      if (data.taskId) child.taskId = data.taskId;
      if (data.generationStatus) child.generationStatus = data.generationStatus;
      if (data.generationType) child.generationType = data.generationType;
      if (data.preserveGeneratedLayout) child.preserveGeneratedLayout = true;
      if (data.refId) child.refId = data.refId;
    }

    // 恢复 historyId
    if (child && data.__historyId) {
      child.__historyId = data.__historyId;
    }
    return child;
  };

  const captureCurrentState = (): HistoryState | null => {
    const app = canvasAppRef.value;
    if (!app?.tree) return null;

    const selectedHistoryIds: string[] = [];
    if (app.editor?.list) {
      app.editor.list.forEach((selectedEl: any) => {
        selectedHistoryIds.push(ensureHistoryId(selectedEl));
      });
    }

    const serialized = app.tree.children
      .filter(
        (child: any) =>
          child.tag !== "SimulateElement" &&
          child.__tag !== "SimulateElement" &&
          !child.isCropOverlay &&
          !child.isTaskOverlay &&
          !isLeftoverTaskOverlay(child),
      )
      .map((child: any) => {
        ensureHistoryIdDeep(child);
        return serializeNode(child);
      });

    return { serialized, selectedHistoryIds };
  };

  const statesEqual = (a: HistoryState | null, b: HistoryState | null) => {
    if (!a || !b) return false;
    return (
      JSON.stringify(a.serialized) === JSON.stringify(b.serialized) &&
      JSON.stringify(a.selectedHistoryIds) ===
        JSON.stringify(b.selectedHistoryIds)
    );
  };

  // ── 差异还原核心 ──────────────────────────────────────────────────────────

  /** 清理节点树中的 VideoNode DOM 视频层 */
  const cleanUpSingleNode = (node: any) => {
    if (node?.children) {
      [...node.children].forEach((child: any) => cleanUpSingleNode(child));
    }
    if (
      (node.tag === "VideoNode" || node.__tag === "VideoNode") &&
      typeof node.removeVideoLayer === "function"
    ) {
      node.removeVideoLayer();
    }
  };

  const collectNodeMap = (nodes: any[], map: Map<string, any>) => {
    nodes.forEach((node) => {
      const historyId = node.__historyId as string | undefined;
      if (historyId) map.set(historyId, node);
      if (node.children?.length) collectNodeMap(node.children, map);
    });
  };

  const collectSerializedMap = (dataList: any[], map: Map<string, any>) => {
    dataList.forEach((data) => {
      if (data.__historyId) map.set(data.__historyId, data);
      if (Array.isArray(data.children)) {
        collectSerializedMap(data.children, map);
      }
    });
  };

  const getStructureShape = (dataList: any[]): any[] =>
    dataList.map((data) => ({
      id: data.__historyId,
      children: Array.isArray(data.children)
        ? getStructureShape(data.children)
        : [],
    }));

  const getStructureSignature = (dataList: any[]): string =>
    JSON.stringify(getStructureShape(dataList));

  const restoreSelection = (
    nodeMap: Map<string, any>,
    selectedHistoryIds: string[],
  ) => {
    const app = canvasAppRef.value;
    if (!app?.editor || selectedHistoryIds.length === 0) return;
    const toSelect = selectedHistoryIds
      .map((historyId) => nodeMap.get(historyId))
      .filter(Boolean);
    if (toSelect.length) app.editor.select(toSelect);
  };

  const restoreFullTree = (targetState: HistoryState) => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    app.lockLayout();
    try {
      const preservedOverlays: any[] = [];
      for (const child of [...app.tree.children]) {
        const childAny = child as any;
        if (
          child.tag === "SimulateElement" ||
          child.__tag === "SimulateElement" ||
          childAny.isCropOverlay ||
          childAny.isTaskOverlay
        ) {
          preservedOverlays.push(child);
          child.remove();
          continue;
        }
        cleanUpSingleNode(child);
        child.remove();
      }

      targetState.serialized.forEach((data) => {
        const node = deserializeNode(data);
        if (node) app.tree.add(node);
      });
      preservedOverlays.forEach((overlay) => app.tree.add(overlay));
    } finally {
      app.unlockLayout();
    }

    const restoredMap = new Map<string, any>();
    collectNodeMap(app.tree.children, restoredMap);
    restoreSelection(restoredMap, targetState.selectedHistoryIds);
  };

  /** 比较两个序列化数据对象的可跟踪属性是否相同 */
  const hasPropertyDiff = (serializedA: any, serializedB: any): boolean => {
    for (const key of COMPARE_KEYS) {
      const a = serializedA[key];
      const b = serializedB[key];
      if (a !== b) {
        // 对 fill 等可能是对象的属性做 JSON 对比
        if (typeof a === "object" && typeof b === "object") {
          if (JSON.stringify(a) !== JSON.stringify(b)) return true;
        } else {
          return true;
        }
      }
    }
    return false;
  };

  /** 从序列化数据中提取需要 set() 的属性补丁 */
  const buildPatch = (
    targetData: any,
    currentData: any,
  ): Record<string, any> => {
    const patch: Record<string, any> = {};
    for (const key of COMPARE_KEYS) {
      const t = targetData[key];
      const c = currentData[key];
      if (t !== c) {
        if (typeof t === "object" && typeof c === "object") {
          if (JSON.stringify(t) !== JSON.stringify(c)) {
            patch[key] = t;
          }
        } else {
          patch[key] = t !== undefined ? t : null;
        }
      }
    }
    return patch;
  };

  /** 属性变化增量恢复；层级或顺序变化时完整恢复节点树。 */
  const restoreToDiff = (targetState: HistoryState) => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    if (app.editor) {
      app.editor.cancel();
    }

    const currentChildren: any[] = app.tree.children.filter(
      (c: any) =>
        c.tag !== "SimulateElement" &&
        c.__tag !== "SimulateElement" &&
        !c.isCropOverlay &&
        !c.isTaskOverlay,
    );
    currentChildren.forEach(ensureHistoryIdDeep);
    const currentSerialized = currentChildren.map(serializeNode);
    if (
      getStructureSignature(currentSerialized) !==
      getStructureSignature(targetState.serialized)
    ) {
      restoreFullTree(targetState);
      return;
    }

    const currentMap = new Map<string, any>();
    const currentSerializedMap = new Map<string, any>();
    const targetSerializedMap = new Map<string, any>();
    collectNodeMap(currentChildren, currentMap);
    collectSerializedMap(currentSerialized, currentSerializedMap);
    collectSerializedMap(targetState.serialized, targetSerializedMap);

    for (const [historyId, targetData] of targetSerializedMap) {
      const existing = currentMap.get(historyId);
      const existingData = currentSerializedMap.get(historyId);
      if (!existing || !existingData || !hasPropertyDiff(targetData, existingData)) {
        continue;
      }
      const patch = buildPatch(targetData, existingData);
      if (Object.keys(patch).length) {
        existing.set(patch);
        if (targetData.tag === "Image" && "url" in patch) {
          applyImagePaintMode(existing);
        }
      }
    }

    restoreSelection(currentMap, targetState.selectedHistoryIds);
  };

  // ── 持久化 ────────────────────────────────────────────────────────────────

  const saveCanvasState = async (workspaceId?: string | number | null) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    const app = canvasAppRef.value;
    if (!app?.tree) return;
    const targetId = workspaceId || activeWorkspaceIdRef?.value;
    if (!targetId) return;
    try {
      const childrenData = app.tree.children
        .filter(
          (child: any) =>
            child.tag !== "SimulateElement" &&
            child.__tag !== "SimulateElement" &&
            !child.isCropOverlay &&
            !child.isTaskOverlay &&
            !isLeftoverTaskOverlay(child),
        )
        .map((child: any) => serializeNode(child));

      await updateWorkspaceCanvas(String(targetId), childrenData);
      console.log("saveCanvasState: successfully saved canvas state.");
    } catch (e) {
      console.error("Failed to save canvas state to server:", e);
    }
  };

  const saveCanvasStateDebounced = (delay = 1000) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveCanvasState();
    }, delay);
  };

  const loadCanvasState = async (workspaceId?: string | number | null) => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;
    const targetId = workspaceId || activeWorkspaceIdRef?.value;
    if (!targetId) return;
    try {
      const dataList = await getWorkspaceCanvas(String(targetId));

      if (Array.isArray(dataList)) {
        if (app.editor) {
          app.editor.cancel();
        }
        // 清理旧 VideoNode 的 DOM 层
        app.tree.children.forEach((child: any) => cleanUpSingleNode(child));
        app.tree.clear();
        dataList.forEach((data: any) => {
          if (isLeftoverCropOverlay(data) || isLeftoverTaskOverlay(data))
            return;
          const child = deserializeNode(data);
          if (child) {
            ensureHistoryIdDeep(child);
            app.tree.add(child);
          }
        });

        // 重置历史基线：使用 JSON 序列化快照
        history.length = 0;
        const serialized = app.tree.children
          .filter(
            (child: any) =>
              child.tag !== "SimulateElement" &&
              child.__tag !== "SimulateElement" &&
              !child.isCropOverlay &&
              !child.isTaskOverlay &&
              !isLeftoverTaskOverlay(child),
          )
          .map((child: any) => serializeNode(child));
        history.push({ serialized, selectedHistoryIds: [] });
        currentIndex = 0;
        return;
      }
    } catch (e) {
      console.error("Failed to restore canvas state:", e);
    }

    // Fallback default node if no saved state on server or fetch error
    if (app.tree.children.length === 0) {
      const imageGen = new ImageGen({
        x: 300,
        y: 200,
        width: 400,
        height: 300,
        editable: true,
      });
      ensureHistoryId(imageGen);
      app.tree.add(imageGen);
    }
  };

  // ── 历史记录 ──────────────────────────────────────────────────────────────

  const recordHistory = (immediateSave = false) => {
    if (isRestoring) return;
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    if (transactionActive) {
      transactionDirty = true;
      return;
    }

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }

    // 如果在时间线中间（undo 后做了新操作），丢弃后面的 redo 状态
    if (currentIndex < history.length - 1) {
      history.splice(currentIndex + 1);
    }

    const nextState = captureCurrentState();
    if (!nextState) return;

    if (currentIndex >= 0 && statesEqual(history[currentIndex], nextState)) {
      if (immediateSave) saveCanvasState();
      else saveCanvasStateDebounced();
      return;
    }

    history.push(nextState);
    currentIndex = history.length - 1;

    if (immediateSave) {
      saveCanvasState();
    } else {
      saveCanvasStateDebounced();
    }
  };

  const recordHistoryDebounced = (
    delay: number | any = 100,
    immediateSave = false,
  ) => {
    if (isRestoring) return;
    if (transactionActive) {
      transactionDirty = true;
      return;
    }
    const actualDelay = typeof delay === "number" ? delay : 100;
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      recordHistory(immediateSave);
    }, actualDelay);
  };

  const beginTransaction = () => {
    if (transactionActive) return;

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
      recordHistory();
    }

    transactionStartState = captureCurrentState();
    transactionDirty = false;
    transactionActive = !!transactionStartState;
  };

  const commitTransaction = () => {
    if (!transactionActive) return false;

    const startState = transactionStartState;
    const endState = captureCurrentState();
    transactionActive = false;
    transactionStartState = null;

    const changed =
      transactionDirty &&
      !!startState &&
      !!endState &&
      !statesEqual(startState, endState);
    transactionDirty = false;

    if (changed) recordHistory();
    return changed;
  };

  const rollbackTransaction = () => {
    if (!transactionActive || !transactionStartState) return false;

    const startState = transactionStartState;
    transactionActive = false;
    transactionDirty = false;
    transactionStartState = null;

    isRestoring = true;
    try {
      restoreToDiff(startState);
      saveCanvasStateDebounced();
    } finally {
      isRestoring = false;
    }
    return true;
  };

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  const undo = () => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    // 刷新挂起的 debounced 变更
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
      recordHistory();
    }

    if (currentIndex <= 0) return;

    isRestoring = true;
    try {
      currentIndex--;
      restoreToDiff(history[currentIndex]);
      saveCanvasStateDebounced();
    } finally {
      isRestoring = false;
    }
  };

  const redo = () => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    // 刷新挂起的 debounced 变更
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
      recordHistory();
    }

    if (currentIndex >= history.length - 1) return;

    isRestoring = true;
    try {
      currentIndex++;
      restoreToDiff(history[currentIndex]);
      saveCanvasStateDebounced();
    } finally {
      isRestoring = false;
    }
  };

  return {
    recordHistory,
    recordHistoryDebounced,
    undo,
    redo,
    canUndo: () => currentIndex > 0,
    canRedo: () => currentIndex < history.length - 1,
    loadCanvasState,
    saveCanvasState,
    beginTransaction,
    commitTransaction,
    rollbackTransaction,
  };
}
