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
  const strokeMatches = data.children.filter((c: any) => c.stroke === "#10b981").length;
  const fillMatches = data.children.filter((c: any) => c.fill === "rgba(0,0,0,0.6)").length;
  return fillMatches === 4 && strokeMatches === 9;
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
  "x", "y", "width", "height", "scaleX", "scaleY", "rotation",
  "skewX", "skewY", "fill", "stroke", "strokeWidth", "cornerRadius",
  "fontSize", "fontFamily", "fontWeight", "textAlign", "lineHeight",
  "letterSpacing", "text", "opacity", "url", "prompt", "model",
  "size", "quality", "aspectRatio", "generationStatus", "errorMessage",
  "taskId", "videoUrl", "thumbnailUrl", "flow", "flowAlign", "flowWrap",
  "gap", "padding", "lockRatio", "editable",
];

/**
 * 增量式画布历史管理。
 *
 * 改进点（相较旧版全量 clone 快照）：
 * 1. 快照使用轻量 JSON 序列化，而非 clone DOM 节点 → 内存 ~10x 降低
 * 2. undo/redo 使用差异还原：只更新变化的节点 → 性能大幅提升
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
            !c.isCropOverlay
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
      } else {
        child = new Group(dataCopy);
      }

      if (child && Array.isArray(childrenData)) {
        childrenData.forEach((childData: any) => {
          const childNode = deserializeNode(childData);
          if (childNode) {
            child.add(childNode);
          }
        });
      }
    }
    // 恢复 historyId 和 refId
    if (child && data.__historyId) {
      child.__historyId = data.__historyId;
    }
    if (child && data.refId) {
      child.refId = data.refId;
    }
    return child;
  };

  // ── 差异还原核心 ──────────────────────────────────────────────────────────

  /** 清理单个 VideoNode 的 DOM 视频层 */
  const cleanUpSingleNode = (node: any) => {
    if (
      (node.tag === "VideoNode" || node.__tag === "VideoNode") &&
      typeof node.removeVideoLayer === "function"
    ) {
      node.removeVideoLayer();
    }
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
  const buildPatch = (targetData: any, currentData: any): Record<string, any> => {
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

  /**
   * 差异还原：将画布从当前状态还原到目标状态，只修改变化的节点。
   *
   * 策略：
   * 1. 构建当前节点 Map (historyId → DOM node) 和当前序列化 Map
   * 2. 遍历目标快照：
   *    - 如果节点存在且属性未变 → 保留原节点
   *    - 如果节点存在但属性变了 → node.set(patch) 原位更新
   *    - 如果节点不存在 → 反序列化创建新节点
   * 3. 删除不在目标中的节点
   * 4. 如果节点顺序变了 → 最小化重排
   */
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
        !c.isCropOverlay,
    );

    // 构建当前节点索引
    const currentMap = new Map<string, any>();
    const currentSerializedMap = new Map<string, any>();
    for (const child of currentChildren) {
      const hid = child.__historyId as string;
      if (hid) {
        currentMap.set(hid, child);
        currentSerializedMap.set(hid, serializeNode(child));
      }
    }

    // 目标节点 ID 集合
    const targetIds = new Set<string>();
    for (const data of targetState.serialized) {
      if (data.__historyId) targetIds.add(data.__historyId);
    }

    // 第一步：删除不在目标中的节点
    for (const [hid, node] of currentMap) {
      if (!targetIds.has(hid)) {
        cleanUpSingleNode(node);
        node.remove();
        currentMap.delete(hid);
      }
    }

    // 第二步：遍历目标快照，更新或创建节点
    const finalChildren: any[] = [];
    for (const targetData of targetState.serialized) {
      const hid = targetData.__historyId;
      const existing = hid ? currentMap.get(hid) : null;

      if (existing) {
        // 节点已存在 — 检查是否需要属性更新
        const currentSerialized = currentSerializedMap.get(hid);
        if (currentSerialized && hasPropertyDiff(targetData, currentSerialized)) {
          const patch = buildPatch(targetData, currentSerialized);
          if (Object.keys(patch).length > 0) {
            existing.set(patch);
          }
        }
        finalChildren.push(existing);
      } else {
        // 节点不存在 — 创建新节点
        const newNode = deserializeNode(targetData);
        if (newNode) {
          finalChildren.push(newNode);
        }
      }
    }

    // 第三步：检查顺序是否需要调整
    const currentOrder = app.tree.children
      .filter(
        (c: any) =>
          c.tag !== "SimulateElement" &&
          c.__tag !== "SimulateElement" &&
          !c.isCropOverlay,
      )
      .map((c: any) => c.__historyId);
    const targetOrder = finalChildren.map((c: any) => c.__historyId);

    const orderChanged =
      currentOrder.length !== targetOrder.length ||
      currentOrder.some((id: string, i: number) => id !== targetOrder[i]);

    if (orderChanged) {
      // 需要重排：先把所有当前节点从 tree 移除（不销毁），再按目标顺序添加
      // 注意：只移除非 SimulateElement 节点
      for (const child of [...app.tree.children]) {
        if (child.tag !== "SimulateElement" && (child as any).__tag !== "SimulateElement") {
          child.remove();
        }
      }
      for (const child of finalChildren) {
        app.tree.add(child);
      }
    }

    // 第四步：恢复选中状态
    if (app.editor && targetState.selectedHistoryIds.length > 0) {
      const toSelect = targetState.selectedHistoryIds
        .map((hid) => {
          // 从 finalChildren 中找，因为 tree.children 可能还包含 SimulateElement
          return finalChildren.find((c: any) => c.__historyId === hid);
        })
        .filter(Boolean);
      if (toSelect.length > 0) {
        app.editor.select(toSelect);
      }
    }
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
            !child.isCropOverlay,
        )
        .map((child: any) => serializeNode(child));
      await updateWorkspaceCanvas(String(targetId), childrenData);
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
          if (isLeftoverCropOverlay(data)) return;
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
              !child.isCropOverlay,
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

  const recordHistory = () => {
    if (isRestoring) return;
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }

    // 如果在时间线中间（undo 后做了新操作），丢弃后面的 redo 状态
    if (currentIndex < history.length - 1) {
      history.splice(currentIndex + 1);
    }

    // 为所有节点确保有 historyId
    app.tree.children.forEach((child: any) => {
      if (
        child.tag !== "SimulateElement" &&
        child.__tag !== "SimulateElement" &&
        !child.isCropOverlay
      ) {
        ensureHistoryIdDeep(child);
      }
    });

    // 获取选中元素的 historyId
    const selectedHistoryIds: string[] = [];
    if (app.editor && app.editor.list) {
      app.editor.list.forEach((selectedEl: any) => {
        if (selectedEl.__historyId) {
          selectedHistoryIds.push(selectedEl.__historyId);
        }
      });
    }

    // 使用 JSON 序列化（非 clone）保存快照
    const serialized = app.tree.children
      .filter(
        (child: any) =>
          child.tag !== "SimulateElement" &&
          child.__tag !== "SimulateElement" &&
          !child.isCropOverlay,
      )
      .map((child: any) => serializeNode(child));
    history.push({ serialized, selectedHistoryIds });
    currentIndex = history.length - 1;

    saveCanvasStateDebounced();
  };

  const recordHistoryDebounced = (delay: number | any = 100) => {
    if (isRestoring) return;
    const actualDelay = typeof delay === "number" ? delay : 100;
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      recordHistory();
    }, actualDelay);
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
  };
}
