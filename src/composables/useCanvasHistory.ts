import { type Ref } from "vue";
import { App, Rect, Ellipse, Polygon, Star, Line, Text, Group, Frame, Pen, Image, Box, Path } from "leafer-ui";
import { ImageGen } from "@/components/canvas/nodes/ImageGen";
import { VideoGen } from "@/components/canvas/nodes/VideoGen";
import { VideoNode } from "@/components/canvas/nodes/VideoNode";

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

/**
 * Composable for managing canvas undo/redo history.
 * Maintains a single timeline list and an index pointer to avoid off-by-one errors.
 */
interface HistoryState {
  snapshot: any[];
  selectedIndices: number[];
}

export function useCanvasHistory(canvasAppRef: Ref<App | null>) {
  const history: HistoryState[] = [];
  let currentIndex = -1;
  let isRestoring = false;
  let debounceTimeout: any = null;

  const cleanUpVideoNodes = (app: App) => {
    if (!app?.tree?.children) return;
    app.tree.children.forEach((child: any) => {
      if (
        (child.tag === "VideoNode" || child.__tag === "VideoNode") &&
        typeof child.removeVideoLayer === "function"
      ) {
        child.removeVideoLayer();
      }
    });
  };

  const serializeNode = (node: any): any => {
    const data = node.toJSON ? node.toJSON() : {};
    data.tag = node.__tag || node.tag;

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
      data.children = node.children.map((c: any) => serializeNode(c));
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
    return child;
  };

  const saveCanvasState = () => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;
    const childrenData = app.tree.children.map((child: any) => serializeNode(child));
    localStorage.setItem("viboard_canvas_state", JSON.stringify(childrenData));
  };

  const loadCanvasState = () => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;
    const saved = localStorage.getItem("viboard_canvas_state");
    if (saved) {
      try {
        const dataList = JSON.parse(saved);
        if (Array.isArray(dataList)) {
          app.tree.clear();
          dataList.forEach((data: any) => {
            const child = deserializeNode(data);
            if (child) {
              app.tree.add(child);
            }
          });
          return;
        }
      } catch (e) {
        console.error("Failed to restore canvas state:", e);
      }
    }

    // Fallback default node if no saved state
    const imageGen = new ImageGen({
      x: 300,
      y: 200,
      width: 400,
      height: 300,
      editable: true,
    });
    app.tree.add(imageGen);
  };

  const recordHistory = () => {
    if (isRestoring) return;
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }

    // If we are in the middle of the timeline (after undos) and perform a new action,
    // discard all future redo states.
    if (currentIndex < history.length - 1) {
      history.splice(currentIndex + 1);
    }

    // Find indices of currently selected elements
    const selectedIndices: number[] = [];
    if (app.editor && app.editor.list) {
      app.editor.list.forEach((selectedEl: any) => {
        const idx = app.tree.children.indexOf(selectedEl);
        if (idx !== -1) {
          selectedIndices.push(idx);
        }
      });
    }

    // Clone all current children to save the snapshot
    const snapshot = app.tree.children.filter((child: any) => child.tag !== "SimulateElement" && child.__tag !== "SimulateElement").map((child: any) => child.clone());
    history.push({ snapshot, selectedIndices });
    currentIndex = history.length - 1;

    saveCanvasState();
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

  const undo = () => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    // Flush any pending debounced change immediately before undoing
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
      recordHistory();
    }

    if (currentIndex <= 0) return;

    isRestoring = true;
    try {
      // Clean up selection before clearing tree to avoid editor overlay bugs
      if (app.editor) {
        app.editor.cancel();
      }

      // Clean up DOM video layers of current nodes before clearing
      cleanUpVideoNodes(app);

      currentIndex--;
      const prevState = history[currentIndex];

      app.tree.clear();
      const restored = prevState.snapshot.map((child: any) => child.clone());
      app.tree.add(restored);

      // Restore selection state
      if (app.editor && prevState.selectedIndices.length > 0) {
        const toSelect = prevState.selectedIndices
          .map((idx) => restored[idx])
          .filter(Boolean);
        if (toSelect.length > 0) {
          app.editor.select(toSelect);
        }
      }

      saveCanvasState();
    } finally {
      isRestoring = false;
    }
  };

  const redo = () => {
    const app = canvasAppRef.value;
    if (!app?.tree) return;

    // Flush any pending debounced change immediately before redoing
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
      recordHistory();
    }

    if (currentIndex >= history.length - 1) return;

    isRestoring = true;
    try {
      // Clean up selection before clearing tree to avoid editor overlay bugs
      if (app.editor) {
        app.editor.cancel();
      }

      // Clean up DOM video layers of current nodes before clearing
      cleanUpVideoNodes(app);

      currentIndex++;
      const nextState = history[currentIndex];

      app.tree.clear();
      const restored = nextState.snapshot.map((child: any) => child.clone());
      app.tree.add(restored);

      // Restore selection state
      if (app.editor && nextState.selectedIndices.length > 0) {
        const toSelect = nextState.selectedIndices
          .map((idx) => restored[idx])
          .filter(Boolean);
        if (toSelect.length > 0) {
          app.editor.select(toSelect);
        }
      }

      saveCanvasState();
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
