import { ref, shallowRef, watch, onMounted, onUnmounted, type Ref } from "vue";
import {
  App,
  MoveEvent,
  PropertyEvent,
  DragEvent,
  Cursor,
  Pen,
  Image,
} from "leafer-ui";

// Define stroke, strokeWidth, and fill getters/setters on Pen prototype
// to delegate styling properties of Pen (which is a Group under the hood) to its child Path elements.
Object.defineProperty(Pen.prototype, "stroke", {
  get(this: any) {
    const firstPath = this.children?.[0];
    return firstPath ? firstPath.stroke : this._stroke;
  },
  set(this: any, val: any) {
    this._stroke = val;
    if (this.children) {
      this.children.forEach((child: any) => {
        if (child.tag === "Path" || child.__tag === "Path") {
          child.stroke = val;
        }
      });
    }
  },
  configurable: true,
});

Object.defineProperty(Pen.prototype, "strokeWidth", {
  get(this: any) {
    const firstPath = this.children?.[0];
    return firstPath ? firstPath.strokeWidth : this._strokeWidth;
  },
  set(this: any, val: any) {
    this._strokeWidth = val;
    if (this.children) {
      this.children.forEach((child: any) => {
        if (child.tag === "Path" || child.__tag === "Path") {
          child.strokeWidth = val;
        }
      });
    }
  },
  configurable: true,
});

Object.defineProperty(Pen.prototype, "fill", {
  get(this: any) {
    const firstPath = this.children?.[0];
    return firstPath ? firstPath.fill : this._fill;
  },
  set(this: any, val: any) {
    this._fill = val;
    if (this.children) {
      this.children.forEach((child: any) => {
        if (child.tag === "Path" || child.__tag === "Path") {
          child.fill = val;
        }
      });
    }
  },
  configurable: true,
});

Object.defineProperty(Pen.prototype, "strokeCap", {
  get(this: any) {
    const firstPath = this.children?.[0];
    return firstPath ? firstPath.strokeCap : this._strokeCap;
  },
  set(this: any, val: any) {
    this._strokeCap = val;
    if (this.children) {
      this.children.forEach((child: any) => {
        if (child.tag === "Path" || child.__tag === "Path") {
          child.strokeCap = val;
        }
      });
    }
  },
  configurable: true,
});

Object.defineProperty(Pen.prototype, "strokeJoin", {
  get(this: any) {
    const firstPath = this.children?.[0];
    return firstPath ? firstPath.strokeJoin : this._strokeJoin;
  },
  set(this: any, val: any) {
    this._strokeJoin = val;
    if (this.children) {
      this.children.forEach((child: any) => {
        if (child.tag === "Path" || child.__tag === "Path") {
          child.strokeJoin = val;
        }
      });
    }
  },
  configurable: true,
});

// Helper to copy Pen styles to newly added child paths
function applyPenStyleToChild(pen: any, child: any) {
  if (child && (child.tag === "Path" || child.__tag === "Path")) {
    if (pen._strokeCap !== undefined) child.strokeCap = pen._strokeCap;
    if (pen._strokeJoin !== undefined) child.strokeJoin = pen._strokeJoin;
    if (pen._stroke !== undefined) child.stroke = pen._stroke;
    if (pen._strokeWidth !== undefined) child.strokeWidth = pen._strokeWidth;
    if (pen._fill !== undefined) child.fill = pen._fill;
  }
}

const originalPenAdd = Pen.prototype.add;
Pen.prototype.add = function (this: any, child: any, index?: number) {
  applyPenStyleToChild(this, child);
  return originalPenAdd.call(this, child, index);
};

const originalPenAddAt = Pen.prototype.addAt;
Pen.prototype.addAt = function (this: any, child: any, index: number) {
  applyPenStyleToChild(this, child);
  return originalPenAddAt.call(this, child, index);
};

import { useCanvasFrame } from "./useCanvasFrame";
import { useCanvasToolbar } from "./useCanvasToolbar";
import { useCanvasShape } from "./useCanvasShape";
import { useCanvasMarker } from "./useCanvasMarker";
import { useCanvasText } from "./useCanvasText";
import { useCanvasHistory } from "./useCanvasHistory";
import { getTaskStatus } from "@/utils/api";
import { ImageGen } from "@/components/canvas/nodes/ImageGen";
import { VideoGen } from "@/components/canvas/nodes/VideoGen";
import { VideoNode } from "@/components/canvas/nodes/VideoNode";

// Leafer UI Plugins
import { EditorEvent } from "@leafer-in/editor";
import "@leafer-in/text-editor";
import "@leafer-in/viewport";
import "@leafer-in/export";
import "@leafer-in/flow";
import "@leafer-in/view";
import "@leafer-in/animate";
import { Snap } from "leafer-x-snap";
import { getRandomCoordinates } from "@/utils/utils";

/**
 * Core composable that manages the Leafer Canvas instance,
 * integrates tool actions, and orchestrates secondary features.
 */
export function useCanvas(
  canvasRef: Ref<HTMLElement | null>,
  colorState?: {
    hue: Ref<number>;
    saturation: Ref<number>;
    lightness: Ref<number>;
    alpha: Ref<number>;
  },
  thicknessState?: Ref<number>,
  fontSizeState?: Ref<number>,
  fontFamilyState?: Ref<string>,
) {
  const canvasApp = shallowRef<App | null>(null);
  const activeTool = ref("select");

  // Fallback default colors if not provided
  const defaultColors = {
    hue: ref(55),
    saturation: ref(100),
    lightness: ref(85),
    alpha: ref(100),
  };
  const colors = colorState || defaultColors;

  // History Composable
  const { recordHistory, recordHistoryDebounced, undo, redo, loadCanvasState } =
    useCanvasHistory(canvasApp);

  // Sub-composable for frame creation and containment logic
  const { enableFrameDraw, disableFrameDraw, attachFrameListeners } =
    useCanvasFrame(canvasApp, activeTool, recordHistory);

  const thickness = thicknessState || ref(4);

  // Sub-composable for shape drawing logic
  const { enableShapeDraw, disableShapeDraw } = useCanvasShape(
    canvasApp,
    activeTool,
    colors,
    thickness,
    recordHistory,
  );

  // Sub-composable for marker drawing logic
  const { enableMarkerDraw, disableMarkerDraw } = useCanvasMarker(
    canvasApp,
    activeTool,
    colors,
    thickness,
    recordHistory,
  );

  // Sub-composable for text drawing logic
  const { enableTextDraw, disableTextDraw } = useCanvasText(
    canvasApp,
    activeTool,
    fontSizeState || ref(24),
    fontFamilyState || ref("Inter"),
    recordHistory,
  );

  // Sub-composable for floating toolbar positioning
  const { selectTarget, toolbarStyle, toolbarVersion, initToolbarListeners } =
    useCanvasToolbar();

  // Clipboard & basic editing states
  let clipboard: any[] = [];
  let pasteOffset = 10;

  const copy = () => {
    const app = canvasApp.value;
    if (!app?.editor?.list?.length) return;
    clipboard = app.editor.list.map((item: any) => item.clone());
    pasteOffset = 10;
  };

  const paste = () => {
    const app = canvasApp.value;
    if (!app?.tree || !clipboard.length) return;

    const newElements = clipboard.map((item: any) => {
      return item.clone({
        x: (item.x ?? 0) + pasteOffset,
        y: (item.y ?? 0) + pasteOffset,
      });
    });
    pasteOffset += 10;

    newElements.forEach((el: any) => app.tree.add(el));
    app.editor.select(newElements);
    recordHistory();
  };

  const cut = () => {
    const app = canvasApp.value;
    if (!app?.editor?.list?.length) return;

    clipboard = app.editor.list.map((item: any) => item.clone());
    pasteOffset = 10;

    app.editor.list.forEach((item: any) => {
      if (
        (item.tag === "VideoNode" || item.__tag === "VideoNode") &&
        typeof item.removeVideoLayer === "function"
      ) {
        item.removeVideoLayer();
      }
      item.remove();
    });
    app.editor.cancel();
    recordHistory();
  };

  const duplicate = () => {
    const app = canvasApp.value;
    if (!app?.tree || !app.editor?.list?.length) return;

    const newElements = app.editor.list.map((item: any) => {
      return item.clone({
        x: (item.x ?? 0) + 10,
        y: (item.y ?? 0) + 10,
      });
    });

    newElements.forEach((el: any) => app.tree.add(el));
    app.editor.select(newElements);
    recordHistory();
  };

  const deleteSelected = () => {
    const app = canvasApp.value;
    if (!app?.editor?.list?.length) return;

    app.editor.list.forEach((item: any) => {
      if (
        (item.tag === "VideoNode" || item.__tag === "VideoNode") &&
        typeof item.removeVideoLayer === "function"
      ) {
        item.removeVideoLayer();
      }
      item.remove();
    });
    app.editor.cancel();
    recordHistory();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const isInput =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable);
    if (isInput) return;

    const key = e.key.toLowerCase();
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl) {
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (key === "y") {
        e.preventDefault();
        redo();
      } else if (key === "c") {
        e.preventDefault();
        copy();
      } else if (key === "v") {
        e.preventDefault();
        paste();
      } else if (key === "x") {
        e.preventDefault();
        cut();
      } else if (key === "d") {
        e.preventDefault();
        duplicate();
      } else if (key === "g") {
        e.preventDefault();
        const app = canvasApp.value;
        if (app && app.editor) {
          if (e.shiftKey) {
            if (typeof app.editor.ungroup === "function") {
              app.editor.ungroup();
              recordHistory();
            }
          } else {
            if (typeof app.editor.group === "function") {
              app.editor.group();
              recordHistory();
            }
          }
        }
      }
    } else {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
    }
  };

  let moveStartHandler: (() => void) | null = null;
  let moveEndHandler: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let watchedElements: any[] = [];
  const onPropertyChange = (e: any) => {
    const trackedProperties = [
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
      "text",
      "flow",
      "flowAlign",
      "flowWrap",
      "gap",
      "padding",
      "lockRatio",
      "generationRequest",
      "generationStatus",
      "resultImages",
      "errorMessage",
    ];
    if (
      trackedProperties.includes(e.attrName) ||
      trackedProperties.includes(e.propertyName)
    ) {
      recordHistoryDebounced();
    }
  };

  const setToolMode = (toolName: string) => {
    const app = canvasApp.value;
    if (!app?.tree) return;
    const editor = app.editor as any;
    const view = app.view as HTMLElement;
    const treeConfig = (app.tree as any).config;

    // Clean up previous MoveEvent listeners
    if (moveStartHandler) {
      app.tree.off(MoveEvent.START, moveStartHandler);
      moveStartHandler = null;
    }
    if (moveEndHandler) {
      app.tree.off(MoveEvent.END, moveEndHandler);
      moveEndHandler = null;
    }

    // Always disable custom draw modes first to prevent cross-activation
    disableFrameDraw();
    disableShapeDraw();
    disableMarkerDraw();
    disableTextDraw();

    if (toolName === "pan") {
      // Pan/Hand mode: disable editor interactions, enable viewport drag-to-pan
      if (editor) {
        editor.cancel();
        editor.hittable = false;
      }
      if (treeConfig?.move) {
        treeConfig.move.drag = true;
      }
      view.style.cursor = "grab";
      app.tree.cursor = "grab";
      (app as any).cursor = "grab";

      // Grabbing cursor feedback
      moveStartHandler = () => {
        if (activeTool.value === "pan") {
          view.style.cursor = "grabbing";
          app.tree.cursor = "grabbing";
          (app as any).cursor = "grabbing";
          (app as any).updateCursor();
        }
      };
      moveEndHandler = () => {
        if (activeTool.value === "pan") {
          view.style.cursor = "grab";
          app.tree.cursor = "grab";
          (app as any).cursor = "grab";
          (app as any).updateCursor();
        }
      };
      app.tree.on(MoveEvent.START, moveStartHandler);
      app.tree.on(MoveEvent.END, moveEndHandler);
    } else if (toolName === "frame") {
      // Frame mode: disable editor, enable frame drawing pointer events
      if (editor) {
        editor.cancel();
        editor.hittable = false;
      }
      if (treeConfig?.move) {
        treeConfig.move.drag = false;
      }
      view.style.cursor = "crosshair";
      app.tree.cursor = "crosshair";
      (app as any).cursor = "crosshair";
      enableFrameDraw();
    } else if (toolName === "shape") {
      // Shape mode: disable editor, enable shape drawing pointer events
      if (editor) {
        editor.cancel();
        editor.hittable = false;
      }
      if (treeConfig?.move) {
        treeConfig.move.drag = false;
      }
      view.style.cursor = "crosshair";
      app.tree.cursor = "crosshair";
      (app as any).cursor = "crosshair";
      enableShapeDraw();
    } else if (toolName === "marker") {
      // Marker mode: disable editor, enable marker drawing pointer events
      if (editor) {
        editor.cancel();
        editor.hittable = false;
      }
      if (treeConfig?.move) {
        treeConfig.move.drag = false;
      }
      view.style.cursor = "url('/pen-cursor.png') 3 28, crosshair";
      app.tree.cursor = "pen" as any;
      (app as any).cursor = "pen";
      enableMarkerDraw();
    } else if (toolName === "text") {
      // Text mode: disable editor, enable double click creation
      if (editor) {
        editor.cancel();
        editor.hittable = false;
      }
      if (treeConfig?.move) {
        treeConfig.move.drag = false;
      }
      view.style.cursor = "text";
      app.tree.cursor = "text";
      (app as any).cursor = "text";
      enableTextDraw();
    } else {
      // Select mode: enable editor, disable pan drag
      if (editor) {
        editor.hittable = true;
      }
      if (treeConfig?.move) {
        treeConfig.move.drag = false;
      }
      view.style.cursor = "default";
      app.tree.cursor = "default";
      (app as any).cursor = "default";
    }

    // Immediately trigger update to sync the new cursor state globally
    (app as any).updateCursor();
  };

  // Watch tool state to update canvas tool mode
  watch(activeTool, (newTool) => {
    setToolMode(newTool);
  });

  const initCanvas = async () => {
    if (!canvasRef.value) return;

    const app = new App({
      view: canvasRef.value,

      editor: {
        editBoxType: "box",
        hideOnMove: false,
        stroke: "var(--p-primary-color)",
        circle: {
          width: 14,
          height: 14,
        },
        rotatePoint: {
          around: { x: 0.5, y: 1 },
          y: 20,
        },
      },
      zoom: {
        min: 0.2,
        max: 200,
      },
      wheel: { preventDefault: true },
      touch: { preventDefault: true },
      pointer: { preventDefaultMenu: true },
      tree: {
        type: "design",
      },
    });

    // Rename the auto-generated leafer-app-view class to hide library details
    const viewEl = canvasRef.value.querySelector(".leafer-app-view");
    const canvasEl = canvasRef.value.querySelector(".leafer-canvas-view");
    if (viewEl) {
      viewEl.classList.remove("leafer-app-view");
      viewEl.classList.add("viboard-canvas-view");
    }
    if (canvasEl) {
      canvasEl.classList.remove("leafer-canvas-view");
      canvasEl.classList.add("viboard-canvas-view");
    }

    canvasApp.value = app;
    (window as any).canvasApp = app;

    // Register custom pen cursor in Leafer UI
    Cursor.set("pen", {
      url: "/pen-cursor.png",
      x: 3,
      y: 28,
    });

    // Initialize smart snapping using leafer-x-snap
    const snap = new Snap(app, {
      snapSize: 6,
      lineColor: "#000000",
      strokeWidth: 1.5,
      dashPattern: [4, 4],
      isDash: true,
      showLinePoints: true,
      filter: (element: any) => {
        try {
          if (
            element.tag === "VideoNode" ||
            element.__tag === "VideoNode" ||
            element.tag === "ImageGen" ||
            element.__tag === "ImageGen"
          )
            return true;
          const points = element.getLayoutPoints("box", app.tree);
          return !!(points && points.length > 0);
        } catch {
          return false;
        }
      },
    });
    snap.enable(true);

    // Observe container resize to update Leafer App dimensions
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        app.resize({ width, height });
      }
    });
    resizeObserver.observe(canvasRef.value);

    // Attach floating toolbar listeners
    initToolbarListeners(app);

    const resumeNodePolling = (node: any) => {
      const taskId = node.taskId;
      if (!taskId) return;

      if ((node as any)._pollingInterval) {
        clearInterval((node as any)._pollingInterval);
      }

      const pollInterval = setInterval(async () => {
        if (!node.parent) {
          clearInterval(pollInterval);
          delete (node as any)._pollingInterval;
          return;
        }

        try {
          const res = await getTaskStatus(taskId);
          if (res.status === "success" && res.imageUrl) {
            clearInterval(pollInterval);
            delete (node as any)._pollingInterval;

            const img = new window.Image();
            img.src = res.imageUrl;
            await new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });

            let newWidth = node.width || 400;
            let newHeight = node.height || 300;
            if (img.naturalWidth && img.naturalHeight) {
              newWidth = img.naturalWidth;
              newHeight = img.naturalHeight;
            }

            const parent = node.parent;
            if (parent) {
              const imageNode = new Image({
                x: node.x,
                y: node.y,
                width: newWidth,
                height: newHeight,
                url: res.imageUrl,
                editable: true,
              });
              if (node.refId) {
                (imageNode as any).refId = node.refId;
              }
              const index = parent.children.indexOf(node);
              parent.addAt(imageNode, index);
              node.remove();
              if (app.editor) {
                app.editor.select(imageNode);
              }
              recordHistoryDebounced();
            }
          } else if (res.status === "error") {
            clearInterval(pollInterval);
            delete (node as any)._pollingInterval;
            const errMsg = res.error || "生成失败，请重试";
            node.set({
              generationStatus: "error",
              errorMessage: errMsg,
            });
            recordHistoryDebounced();
          }
        } catch (err: any) {
          console.error(`Polling failed for task ${taskId}:`, err);
          if (err.response?.status === 404) {
            clearInterval(pollInterval);
            delete (node as any)._pollingInterval;
            node.set({
              generationStatus: "error",
              errorMessage: "任务不存在或服务器已重启，请重新生成",
            });
            recordHistoryDebounced();
          }
        }
      }, 2000);

      (node as any)._pollingInterval = pollInterval;
    };

    // Restore saved elements or add initial ImageGen element
    loadCanvasState();

    // Zoom to fit all elements on initialization
    setTimeout(() => {
      try {
        if (app.tree && app.tree.children && app.tree.children.length > 0) {
          (app.tree as any).zoom("fit", 80, undefined, 0); // 0 duration for instant fit on load
        }
      } catch (err) {
        console.warn("Failed to auto-zoom canvas on initialization:", err);
      }
    }, 150);

    // Record initial history state
    recordHistory();

    const resumeVideoNodePolling = (node: any) => {
      const taskId = node.taskId;
      if (!taskId) return;

      if ((node as any)._pollingInterval) {
        clearInterval((node as any)._pollingInterval);
      }

      const pollInterval = setInterval(async () => {
        if (!node.parent) {
          clearInterval(pollInterval);
          delete (node as any)._pollingInterval;
          return;
        }

        try {
          const res = await getTaskStatus(taskId);
          if (res.status === "success" && res.videoUrl && res.thumbnailUrl) {
            clearInterval(pollInterval);
            delete (node as any)._pollingInterval;

            const img = new window.Image();
            img.src = res.thumbnailUrl;
            await new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });

            let newWidth = node.width || 400;
            let newHeight = node.height || 300;
            if (img.naturalWidth && img.naturalHeight) {
              newWidth = img.naturalWidth;
              newHeight = img.naturalHeight;
            } else {
              newWidth = 480;
              newHeight = 270;
            }

            const parent = node.parent;
            if (parent) {
              const videoNode = await VideoNode.create({
                x: node.x,
                y: node.y,
                width: newWidth,
                height: newHeight,
                videoUrl: res.videoUrl,
                thumbnailUrl: res.thumbnailUrl,
                editable: true,
              });
              if (videoNode) {
                if (node.refId) {
                  (videoNode as any).refId = node.refId;
                }
                const index = parent.children.indexOf(node);
                parent.addAt(videoNode, index);
                node.remove();
                if (app.editor) {
                  app.editor.select(videoNode);
                }
                recordHistoryDebounced();
              }
            }
          } else if (res.status === "error") {
            clearInterval(pollInterval);
            delete (node as any)._pollingInterval;
            const errMsg = res.error || "生成失败，请重试";
            node.set({
              generationStatus: "error",
              errorMessage: errMsg,
            });
            recordHistoryDebounced();
          }
        } catch (err: any) {
          console.error(`Polling failed for video task ${taskId}:`, err);
          if (err.response?.status === 404) {
            clearInterval(pollInterval);
            delete (node as any)._pollingInterval;
            node.set({
              generationStatus: "error",
              errorMessage: "任务不存在或服务器已重启，请重新生成",
            });
            recordHistoryDebounced();
          }
        }
      }, 2000);

      (node as any)._pollingInterval = pollInterval;
    };

    const attachTaskStartListener = (node: any) => {
      node.on("task-start", () => {
        resumeNodePolling(node);
      });
    };

    const attachVideoTaskStartListener = (node: any) => {
      node.on("task-start", () => {
        resumeVideoNodePolling(node);
      });
    };

    const initFrameListeners = (node: any) => {
      if (node.tag === "Frame" || node.__tag === "Frame") {
        attachFrameListeners(node);
      }
      if (node.children) {
        node.children.forEach(initFrameListeners);
      }
    };

    // Scan for any nodes to initialize frame listeners and ImageGen/VideoGen listeners
    app.tree.children.forEach((child: any) => {
      initFrameListeners(child);
      if (child.tag === "ImageGen" || child.__tag === "ImageGen") {
        attachTaskStartListener(child);
        if (child.generationStatus === "generating" && child.taskId) {
          resumeNodePolling(child);
        }
      }
      if (child.tag === "VideoGen" || child.__tag === "VideoGen") {
        attachVideoTaskStartListener(child);
        if (child.generationStatus === "generating" && child.taskId) {
          resumeVideoNodePolling(child);
        }
      }
    });

    // Listen to child.add event to attach listeners to dynamically added nodes
    app.tree.on("child.add", (e: any) => {
      const child = e.child;
      if (child) {
        initFrameListeners(child);
        if (child.tag === "ImageGen" || child.__tag === "ImageGen") {
          attachTaskStartListener(child);
        }
        if (child.tag === "VideoGen" || child.__tag === "VideoGen") {
          attachVideoTaskStartListener(child);
        }
      }
    });

    // Listen to editor transform end events to record history immediately
    app.editor.on(DragEvent.END, () => {
      console.log("拖拽结束");
      recordHistory();
    });
    app.editor.on(MoveEvent.END, () => {
      console.log("移动结束");
      recordHistory();
    });

    // Listen to selection changes to watch selected elements' property changes
    const updatePropertyWatchers = () => {
      watchedElements.forEach((el) => {
        el.off(PropertyEvent.CHANGE, onPropertyChange);
      });
      watchedElements = [];

      if (app.editor && app.editor.list) {
        app.editor.list.forEach((el: any) => {
          el.on(PropertyEvent.CHANGE, onPropertyChange);
          watchedElements.push(el);
        });
      }
    };

    app.editor.on(EditorEvent.SELECT, updatePropertyWatchers);
  };

  const preventPageZoom = (e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  };

  onMounted(async () => {
    document.addEventListener("wheel", preventPageZoom, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    await initCanvas();
  });

  onUnmounted(() => {
    document.removeEventListener("wheel", preventPageZoom);
    window.removeEventListener("keydown", onKeyDown);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    watchedElements.forEach((el) => {
      el.off(PropertyEvent.CHANGE, onPropertyChange);
    });
    watchedElements = [];
    if (canvasApp.value) {
      canvasApp.value.destroy();
    }
  });

  const addImageGenNode = () => {
    const app = canvasApp.value;
    if (!app?.tree) return;

    // 在画布较大范围内随机位置放置元素（避免堆在一起）
    const { x, y } = getRandomCoordinates({ range: 2000 });

    const imageGen = new ImageGen({
      x: x,
      y: y,
      width: 400,
      height: 300,
      editable: true,
    });

    app.tree.add(imageGen);

    if (app.editor) {
      app.editor.app.tree?.zoom(imageGen, 300, undefined, 0.5);
      setTimeout(() => {
        app.editor.select(imageGen);
      }, 500);
    }

    recordHistory();
  };

  const addVideoGenNode = () => {
    const app = canvasApp.value;
    if (!app?.tree) return;

    const { x, y } = getRandomCoordinates({ range: 2000 });

    const videoGen = new VideoGen({
      x: x,
      y: y,
      width: 480,
      height: 270, // default 16:9 sizing
      editable: true,
    });

    app.tree.add(videoGen);

    if (app.editor) {
      app.editor.app.tree?.zoom(videoGen, 300, undefined, 0.5);
      setTimeout(() => {
        app.editor.select(videoGen);
      }, 500);
    }

    recordHistory();
  };

  return {
    canvasApp,
    activeTool,
    selectTarget,
    toolbarStyle,
    toolbarVersion,
    recordHistoryDebounced,
    addImageGenNode,
    addVideoGenNode,
  };
}
