import { ref, shallowRef, watch, onMounted, onUnmounted, type Ref } from "vue";
import { useTheme } from "@/composables/useTheme";
import {
  App,
  MoveEvent,
  PropertyEvent,
  DragEvent,
  Cursor,
  Image,
  Debug,
} from "leafer-ui";

// Suppress EventCreator repeat warnings from plugins
Debug.showWarn = false;
// Define stroke, strokeWidth, and fill getters/setters on Pen prototype
// to delegate styling properties of Pen (which is a Group under the hood) to its child Path elements.
/*
Object.defineProperty(Pen.prototype, "stroke", {
  get(this: any) {
    const firstPath = this.children?.[0];
    const color = firstPath ? firstPath.stroke : this._stroke;
    const fn = function () {};
    fn.toString = () => String(color || "");
    fn.valueOf = () => color;
    (fn as any).color = color;
    return fn as any;
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
    const color = firstPath ? firstPath.fill : this._fill;
    const fn = function () {};
    fn.toString = () => String(color || "");
    fn.valueOf = () => color;
    (fn as any).color = color;
    return fn as any;
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
*/

/*
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
*/

/*
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
*/

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
import { CustomSnap as Snap } from "@/utils/CustomSnap";
import { getNonOverlappingCoordinates } from "@/utils/utils";

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
  activeWorkspaceIdRef?: Ref<string | number | null>,
) {
  const loading = ref(true);
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
  const {
    recordHistory,
    recordHistoryDebounced,
    undo,
    redo,
    loadCanvasState,
    saveCanvasState,
  } = useCanvasHistory(canvasApp, activeWorkspaceIdRef);

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

    // Don't intercept copy/cut when user has selected text (e.g. in chat panel)
    const selection = window.getSelection();
    const hasTextSelection =
      selection && selection.toString().trim().length > 0;
    const key = e.key.toLowerCase();
    const isCtrl = e.ctrlKey || e.metaKey;
    if (hasTextSelection && isCtrl && (key === "c" || key === "x")) return;

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
    const app = canvasApp.value;
    // Skip recording history during continuous dragging (DragEvent.END handles history)
    if (app?.editor && (app.editor as any).dragging) {
      return;
    }

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
    const editor = app.editor;
    const view = app.view as HTMLElement;
    const treeConfig = app.tree.config;

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
      app.cursor = "grab";

      // Grabbing cursor feedback
      moveStartHandler = () => {
        if (activeTool.value === "pan") {
          view.style.cursor = "grabbing";
          app.tree.cursor = "grabbing";
          app.cursor = "grabbing";
          app.updateCursor?.();
        }
      };
      moveEndHandler = () => {
        if (activeTool.value === "pan") {
          view.style.cursor = "grab";
          app.tree.cursor = "grab";
          app.cursor = "grab";
          app.updateCursor?.();
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
      app.cursor = "crosshair";
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
      app.cursor = "crosshair";
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
      app.cursor = "pen" as any;
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
      app.cursor = "text";
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
      app.cursor = "default";
    }

    // Immediately trigger update to sync the new cursor state globally
    app.updateCursor?.();
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
        stroke: "#3d8bd6",
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
        min: 0.01,
        max: 2,
      },
      wheel: { preventDefault: true, zoomSpeed: 0.05 },
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
    window.canvasApp = app;
    app.recordHistory = recordHistory;
    app.recordHistoryDebounced = recordHistoryDebounced;

    // Register custom pen cursor in Leafer UI
    Cursor.set("pen", {
      url: "/pen-cursor.png",
      x: 3,
      y: 28,
    });

    // Initialize smart snapping using leafer-x-snap
    const snap = new Snap(app as any, {
      snapSize: 6,
      lineColor: "#3d8bd6",
      strokeWidth: 1.5,
      dashPattern: [4, 4],
      isDash: true,
      showLinePoints: true,
      filter: (element: any) => {
        try {
          if (
            element.tag === "VideoNode" ||
            element.__tag === "VideoNode" ||
            element.tag === "VideoGen" ||
            element.__tag === "VideoGen" ||
            element.tag === "ImageGen" ||
            element.__tag === "ImageGen"
          )
            return true;
          if (typeof element.getLayoutPoints === "function") {
            const points = element.getLayoutPoints("box", app.tree);
            if (points && points.length > 0) return true;
          }
          const bounds = element.getLayoutBounds("box", app.tree);
          return !!(bounds && bounds.width !== undefined);
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

      if (node._pollingInterval) {
        clearInterval(node._pollingInterval);
      }

      const pollInterval = setInterval(async () => {
        if (!node.parent) {
          clearInterval(pollInterval);
          delete node._pollingInterval;
          return;
        }

        try {
          const res = await getTaskStatus(taskId);
          if (res.status === "success" && res.imageUrl) {
            clearInterval(pollInterval);
            delete node._pollingInterval;
            node.generationStatus = "success"; // hide placeholder immediately

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
                imageNode.refId = node.refId;
              }
              const index = parent.children.indexOf(node);
              parent.addAt(imageNode, index);
              node.emit("generation-complete", {});
              node.remove();
              if (app.editor) {
                setTimeout(() => {
                  if (imageNode.parent && app.editor) {
                    app.editor.select(imageNode);
                  }
                }, 50);
              }
              recordHistoryDebounced();
            }
          } else if (res.status === "error") {
            clearInterval(pollInterval);
            delete node._pollingInterval;
            const errMsg = res.error || "生成失败，请重试";
            node.set({
              generationStatus: "error",
              errorMessage: errMsg,
            });
            // Error is a generation status change, not an element-level change — skip history
          }
        } catch (err: any) {
          console.error(`Polling failed for task ${taskId}:`, err);
          if (err.response?.status === 404) {
            clearInterval(pollInterval);
            delete node._pollingInterval;
            node.set({
              generationStatus: "error",
              errorMessage: "任务不存在或服务器已重启，请重新生成",
            });
            // Error is a generation status change, not an element-level change — skip history
          }
        }
      }, 2000);

      node._pollingInterval = pollInterval;
    };

    // Restore saved elements or add initial ImageGen element
    await loadCanvasState();
    loading.value = false;

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

      if (node._pollingInterval) {
        clearInterval(node._pollingInterval);
      }

      const pollInterval = setInterval(async () => {
        if (!node.parent) {
          clearInterval(pollInterval);
          delete node._pollingInterval;
          return;
        }

        try {
          const res = await getTaskStatus(taskId);
          if (res.status === "success" && res.videoUrl && res.thumbnailUrl) {
            clearInterval(pollInterval);
            delete node._pollingInterval;

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
                isSnap: true,
              });
              if (videoNode) {
                if (node.refId) {
                  videoNode.refId = node.refId;
                }
                const index = parent.children.indexOf(node);
                parent.addAt(videoNode as any, index);
                node.emit("generation-complete", {});
                node.remove();
                if (app.editor) {
                  setTimeout(() => {
                    if (videoNode.parent && app.editor) {
                      app.editor.select(videoNode as any);
                    }
                  }, 50);
                }
                recordHistoryDebounced();
              }
            }
          } else if (res.status === "error") {
            clearInterval(pollInterval);
            delete node._pollingInterval;
            const errMsg = res.error || "生成失败，请重试";
            node.set({
              generationStatus: "error",
              errorMessage: errMsg,
            });
            // Error is a generation status change, not an element-level change — skip history
          }
        } catch (err: any) {
          console.error(`Polling failed for video task ${taskId}:`, err);
          if (err.response?.status === 404) {
            clearInterval(pollInterval);
            delete node._pollingInterval;
            node.set({
              generationStatus: "error",
              errorMessage: "任务不存在或服务器已重启，请重新生成",
            });
            // Error is a generation status change, not an element-level change — skip history
          }
        }
      }, 2000);

      node._pollingInterval = pollInterval;
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

    const attachContainerChildAddListener = (container: any) => {
      if (!container || container._hasChildAddListener) return;
      container._hasChildAddListener = true;

      container.on("child.add", (e: any) => {
        const child = e.child;
        if (child) {
          initNodeListeners(child);
        }
      });
    };

    const initNodeListeners = (node: any) => {
      if (!node) return;

      if (
        node.tag === "Frame" ||
        node.__tag === "Frame" ||
        node.tag === "Group" ||
        node.__tag === "Group"
      ) {
        attachFrameListeners(node);
        attachContainerChildAddListener(node);
      }

      if (node.tag === "ImageGen" || node.__tag === "ImageGen") {
        attachTaskStartListener(node);
        if (node.generationStatus === "generating" && node.taskId) {
          resumeNodePolling(node);
        }
      }

      if (node.tag === "VideoGen" || node.__tag === "VideoGen") {
        attachVideoTaskStartListener(node);
        if (node.generationStatus === "generating" && node.taskId) {
          resumeVideoNodePolling(node);
        }
      }

      if (node.children) {
        node.children.forEach(initNodeListeners);
      }
    };

    // Scan for any nodes to initialize frame listeners and ImageGen/VideoGen listeners
    if (app.tree.children) {
      app.tree.children.forEach((child: any) => {
        initNodeListeners(child);
      });
    }

    // Listen to child.add event to attach listeners to dynamically added nodes
    app.tree.on("child.add", (e: any) => {
      const child = e.child;
      if (child) {
        initNodeListeners(child);
      }
    });

    // Listen to editor transform end events to record history immediately
    app.editor.on(DragEvent.END, () => {
      recordHistory();
    });
    app.editor.on(MoveEvent.END, () => {
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

    // Watch active workspace ID to reload canvas
    if (activeWorkspaceIdRef) {
      watch(
        () => activeWorkspaceIdRef.value,
        async (newId, oldId) => {
          if (newId && newId !== oldId && app.tree) {
            loading.value = true;
            try {
              if (oldId) {
                await saveCanvasState(oldId);
              }
              await loadCanvasState(newId);

              // Resume frame and task start/polling listeners for the newly loaded nodes
              if (app.tree.children) {
                app.tree.children.forEach((child: any) => {
                  initNodeListeners(child);
                });
              }

              // Auto-zoom to fit elements
              setTimeout(() => {
                try {
                  if (app.tree.children && app.tree.children.length > 0) {
                    app.tree.zoom?.("fit", 80, undefined, 0);
                  }
                } catch (err) {
                  console.warn(
                    "Failed to zoom to fit after workspace change:",
                    err,
                  );
                }
              }, 150);
            } finally {
              loading.value = false;
            }
          }
        },
        {
          immediate: true,
          deep: true,
        },
      );
    }
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
    if (activeWorkspaceIdRef?.value) {
      void saveCanvasState(activeWorkspaceIdRef.value);
    }
    if (canvasApp.value) {
      canvasApp.value.destroy();
    }
  });

  const addImageGenNode = () => {
    const app = canvasApp.value;
    if (!app?.tree) return;

    // 获取画布上所有元素的边界框
    const existingBounds = Array.from(app.tree.children || [])
      .filter((child: any) => child.x !== undefined && child.y !== undefined)
      .map((child: any) => ({
        x: child.x,
        y: child.y,
        width: child.width || 400,
        height: child.height || 300,
      }));

    // 在画布较大范围内随机位置放置元素（避免堆在一起且不遮挡其他元素）
    const { x, y } = getNonOverlappingCoordinates({
      range: 2000,
      existingBounds,
      newWidth: 400,
      newHeight: 300,
      margin: 50,
    });

    const imageGen = new ImageGen({
      x: x,
      y: y,
      width: 400,
      height: 300,
      editable: true,
    });

    app.tree.add(imageGen as any);

    if (app.editor) {
      app.editor.app.tree?.zoom?.(imageGen as any, 300, undefined, 0.5);
      setTimeout(() => {
        app.editor.select(imageGen as any);
      }, 500);
    }

    recordHistory();
  };

  const addVideoGenNode = () => {
    const app = canvasApp.value;
    if (!app?.tree) return;

    // 获取画布上所有元素的边界框
    const existingBounds = Array.from(app.tree.children || [])
      .filter((child: any) => child.x !== undefined && child.y !== undefined)
      .map((child: any) => ({
        x: child.x,
        y: child.y,
        width: child.width || 480,
        height: child.height || 270,
      }));

    const { x, y } = getNonOverlappingCoordinates({
      range: 2000,
      existingBounds,
      newWidth: 480,
      newHeight: 270,
      margin: 50,
    });

    const videoGen = new VideoGen({
      x: x,
      y: y,
      width: 480,
      height: 270, // default 16:9 sizing
      editable: true,
    });

    app.tree.add(videoGen as any);

    if (app.editor) {
      app.editor.app.tree?.zoom?.(videoGen as any, 300, undefined, 0.5);
      setTimeout(() => {
        app.editor.select(videoGen as any);
      }, 500);
    }

    recordHistory();
  };

  return {
    loading,
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
