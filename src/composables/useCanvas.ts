import {
  ref,
  shallowRef,
  watch,
  onMounted,
  onUnmounted,
  toRaw,
  type Ref,
} from "vue";
import { gsap } from "gsap";
import {
  App,
  MoveEvent,
  PropertyEvent,
  DragEvent,
  Cursor,
  Debug,
  Rect,
  Text,
  Box,
  PointerEvent,
} from "leafer-ui";
import { applyImagePaintMode, createFitImage } from "@/utils/leaferImage";

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
import { getImageTaskLoadingText } from "@/utils/imageTask";

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
    beginTransaction: beginHistoryTransaction,
    commitTransaction: commitHistoryTransaction,
    rollbackTransaction: rollbackHistoryTransaction,
    disposeCanvasHistory,
  } = useCanvasHistory(canvasApp, activeWorkspaceIdRef);

  // Sub-composable for frame creation and containment logic
  const {
    enableFrameDraw,
    disableFrameDraw,
    attachFrameDropFallback,
    attachFrameListeners,
  } = useCanvasFrame(canvasApp, activeTool, recordHistory);

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
  let lastCanvasSize: { width: number; height: number } | null = null;
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
        stroke: "#007aff",

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
      move: { dragOut: true },
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
    attachFrameDropFallback();
    window.canvasApp = app;
    app.recordHistory = recordHistory;
    app.recordHistoryDebounced = recordHistoryDebounced;

    // Listen to Ctrl+Left Click to send element to agent dialogue panel as reference image
    app.on(PointerEvent.TAP, (e: PointerEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const target = e.target as any;
        const invalidTags = new Set([
          "Leafer",
          "App",
          "Viewport",
          "Editor",
          "EditBox",
          "Page",
          "ImageGen",
          "VideoGen",
        ]);
        let checkNode = target;
        let isInvalid = false;
        while (checkNode && checkNode !== (app.tree as any)) {
          if (
            !checkNode.tag ||
            invalidTags.has(checkNode.tag) ||
            checkNode.tag.startsWith("Edit")
          ) {
            isInvalid = true;
            break;
          }
          checkNode = checkNode.parent;
        }

        if (target && !isInvalid && typeof target.export === "function") {
          target
            .export("png")
            .then((res: any) => {
              if (res && res.data) {
                const base64DataUrl = res.data.startsWith("data:")
                  ? res.data
                  : `data:image/png;base64,${res.data}`;

                // Create floating ghost thumbnail
                const ghost = document.createElement("img");
                ghost.src = base64DataUrl;
                ghost.style.position = "fixed";
                ghost.style.zIndex = "999999";
                ghost.style.pointerEvents = "none";
                ghost.style.width = "80px";
                ghost.style.height = "80px";
                ghost.style.objectFit = "cover";
                ghost.style.borderRadius = "8px";
                ghost.style.border = "2px solid #ffffff";
                ghost.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";

                // Set start position (centered on client cursor coordinates)
                const startX =
                  (e as any).clientX || (e as any).x || window.innerWidth / 2;
                const startY =
                  (e as any).clientY || (e as any).y || window.innerHeight / 2;
                ghost.style.left = `${startX - 40}px`;
                ghost.style.top = `${startY - 40}px`;

                document.body.appendChild(ghost);

                // Find target DOM element (chat input container)
                const targetEl = document.querySelector(".agent-input-wrap");

                const startAnimation = () => {
                  const finalTargetEl =
                    document.querySelector(".agent-input-wrap");
                  let endX = window.innerWidth - 210; // Predicted center of the 420px panel on the right
                  let endY = window.innerHeight - 120; // Predicted height of input attachments area
                  if (finalTargetEl) {
                    const rect = finalTargetEl.getBoundingClientRect();
                    // Only use real DOM coordinates if the panel is already positioned on the right
                    if (rect.left > window.innerWidth - 500 && rect.top > 0) {
                      endX = rect.left + rect.width / 2;
                      endY = rect.top + 40;
                    }
                  }

                  // Setup Bezier control points for the curve
                  const P0 = { x: startX - 40, y: startY - 40 };
                  const P2 = { x: endX - 40, y: endY - 40 };
                  const P1 = {
                    x: (P0.x + P2.x) / 2,
                    y: Math.min(P0.y, P2.y) - 150, // Curve upwards by 150px
                  };

                  const anim = { progress: 0 };

                  // Animate along Bezier curve using GSAP
                  gsap.to(anim, {
                    progress: 1,
                    duration: 0.7,
                    ease: "power2.out",
                    onUpdate: () => {
                      const t = anim.progress;
                      const x =
                        (1 - t) * (1 - t) * P0.x +
                        2 * (1 - t) * t * P1.x +
                        t * t * P2.x;
                      const y =
                        (1 - t) * (1 - t) * P0.y +
                        2 * (1 - t) * t * P1.y +
                        t * t * P2.y;

                      const scale = 1 - t * 0.7; // Shrink to 0.3
                      const opacity = 1 - t * 0.4; // Fade slightly

                      ghost.style.left = `${x}px`;
                      ghost.style.top = `${y}px`;
                      ghost.style.transform = `scale(${scale})`;
                      ghost.style.opacity = `${opacity}`;
                    },
                    onComplete: () => {
                      ghost.remove();

                      // Dispatch custom event to push reference image to AgentInput
                      window.dispatchEvent(
                        new CustomEvent("agent:add-reference-image", {
                          detail: { image: base64DataUrl },
                        }),
                      );

                      // Pulse/bounce animation on the agent input panel to signify insertion
                      if (finalTargetEl) {
                        gsap.fromTo(
                          finalTargetEl,
                          { scale: 1 },
                          {
                            scale: 1.02,
                            duration: 0.12,
                            yoyo: true,
                            repeat: 1,
                            ease: "power1.inOut",
                          },
                        );
                      }

                      // Show success toast
                      window.dispatchEvent(
                        new CustomEvent("canvas:toast", {
                          detail: {
                            severity: "success",
                            summary: "已添加参考图",
                            detail: "该元素已成功添加到 AI 对话面板作为参考图",
                            life: 2000,
                          },
                        }),
                      );
                    },
                  });
                };

                if (!targetEl) {
                  // If closed, trigger panel open first, then start animation after slide-in
                  window.dispatchEvent(new CustomEvent("agent:open-panel"));
                  setTimeout(startAnimation, 300);
                } else {
                  startAnimation();
                }
              }
            })
            .catch((err: any) => {
              console.error("Failed to export target element:", err);
            });
        }
      }
    });

    // Register custom pen cursor in Leafer UI
    Cursor.set("pen", {
      url: "/pen-cursor.png",
      x: 3,
      y: 28,
    });

    // Initialize smart snapping using leafer-x-snap
    const snap = new Snap(app as any, {
      snapSize: 6,
      lineColor: "#007aff",
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
        const tree = app.tree as any;
        const scale = tree.scaleX || tree.scale || 1;
        const previousSize = lastCanvasSize;
        const worldCenter = previousSize
          ? {
              x: (previousSize.width / 2 - (tree.x || 0)) / scale,
              y: (previousSize.height / 2 - (tree.y || 0)) / scale,
            }
          : null;

        app.resize({ width, height });

        if (worldCenter && width > 0 && height > 0) {
          tree.set({
            x: width / 2 - worldCenter.x * scale,
            y: height / 2 - worldCenter.y * scale,
          });
        }

        lastCanvasSize = { width, height };
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
          const generatedUrls = Array.isArray(res.images) && res.images.length > 0
            ? res.images.map((image) => image.imageUrl || image.url).filter(Boolean)
            : res.imageUrl
              ? [res.imageUrl]
              : [];
          if (res.status === "success" && generatedUrls.length > 0) {
            clearInterval(pollInterval);
            delete node._pollingInterval;
            node.generationStatus = "success"; // hide placeholder immediately

            const loadedImages = await Promise.all(
              generatedUrls.map((url) => new Promise<HTMLImageElement>((resolve) => {
                const img = new window.Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(img);
                img.src = url;
              })),
            );

            const isBatch = generatedUrls.length > 1;
            const baseWidth = node.width || 400;
            const fallbackHeight = node.height || 300;
            const layouts = loadedImages.map((img) => {
              if (isBatch) {
                return {
                  width: baseWidth,
                  height: img.naturalWidth && img.naturalHeight
                    ? Math.max(1, Math.round(baseWidth * img.naturalHeight / img.naturalWidth))
                    : fallbackHeight,
                };
              }
              if (
                node.preserveGeneratedLayout !== true &&
                img.naturalWidth &&
                img.naturalHeight
              ) {
                return { width: img.naturalWidth, height: img.naturalHeight };
              }
              return { width: baseWidth, height: fallbackHeight };
            });

            const parent = node.parent;
            if (parent) {
              const index = parent.children.indexOf(node);
              const columns = isBatch
                ? Math.min(3, Math.ceil(Math.sqrt(generatedUrls.length)))
                : 1;
              const gap = 24;
              const rowHeights: number[] = [];
              layouts.forEach((layout, itemIndex) => {
                const row = Math.floor(itemIndex / columns);
                rowHeights[row] = Math.max(rowHeights[row] || 0, layout.height);
              });
              const createdNodes = generatedUrls.map((url, itemIndex) => {
                const layout = layouts[itemIndex]!;
                const column = itemIndex % columns;
                const row = Math.floor(itemIndex / columns);
                const yOffset = rowHeights
                  .slice(0, row)
                  .reduce((sum, height) => sum + height + gap, 0);
                const imageNode = createFitImage({
                  x: node.x + column * (baseWidth + gap),
                  y: node.y + yOffset,
                  width: layout.width,
                  height: layout.height,
                  url,
                  editable: true,
                });
                if (itemIndex === 0 && node.refId) imageNode.refId = node.refId;
                parent.addAt(imageNode, index + itemIndex);
                return imageNode;
              });
              node.emit("generation-complete", {});
              node.remove();
              if (app.editor) {
                setTimeout(() => {
                  const firstNode = createdNodes[0];
                  if (firstNode?.parent && app.editor) {
                    app.editor.select(firstNode);
                  }
                }, 50);
              }
              if (res.partial) {
                window.dispatchEvent(
                  new CustomEvent("canvas:toast", {
                    detail: {
                      severity: "warn",
                      summary: "部分生成成功",
                      detail: `请求 ${res.requestedCount || generatedUrls.length} 张，成功 ${generatedUrls.length} 张；失败部分未扣积分。`,
                    },
                  }),
                );
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

    const resumeImageTaskPolling = (node: any) => {
      const rawNode = toRaw(node);
      const taskId = rawNode.taskId;
      if (!taskId) return;

      // Prevent duplicate polling of the same task ID on the same node
      if (rawNode._pollingTaskId === taskId) return;
      rawNode._pollingTaskId = taskId;

      const parent = rawNode.parent;
      if (!parent) {
        delete rawNode._pollingTaskId;
        return;
      }

      const rawParent = toRaw(parent);

      if (rawNode._pollingInterval) {
        clearInterval(rawNode._pollingInterval);
      }

      // 1. Create loading overlay Box in parent
      const w = rawNode.width || 200;
      const h = rawNode.height || 200;

      const loadingGroup = new Box({
        x: rawNode.x,
        y: rawNode.y,
        width: w,
        height: h,
        scaleX: rawNode.scaleX,
        scaleY: rawNode.scaleY,
        rotation: rawNode.rotation,
        overflow: "hide",
        hittest: false, // Completely click-through so user can drag/move image underneath
      });
      (loadingGroup as any).isTaskOverlay = true;

      const mask = new Rect({
        width: w,
        height: h,
        fill: "rgba(255, 255, 255, 0.75)",
        cornerRadius: rawNode.cornerRadius || 0,
      });

      const loadingRect = new Rect({
        x: -w,
        width: w,
        height: h,
        fill: {
          type: "linear",
          from: { type: "percent", x: 0, y: 0.5 },
          to: { type: "percent", x: 1, y: 0.5 },
          stops: [
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.6)",
            "rgba(255,255,255,0)",
          ],
        },
      });

      const text = getImageTaskLoadingText(rawNode.generationType);
      const loadingText = new Text({
        x: w / 2,
        y: h / 2,
        text,
        fontSize: Math.max(12, Math.min(16, w / 15)),
        fontWeight: "bold",
        fill: "#00000080",
        textAlign: "center",
        verticalAlign: "middle",
      });

      loadingGroup.add(mask);
      loadingGroup.add(loadingRect);
      loadingGroup.add(loadingText);

      // Add to parent right above the image to maintain z-index order
      const index = rawParent.children.indexOf(rawNode);
      if (index !== -1) {
        rawParent.addAt(loadingGroup, index + 1);
      } else {
        rawParent.add(loadingGroup);
      }
      rawNode._loadingGroup = loadingGroup;

      loadingRect.animate(
        {
          x: w,
        },
        {
          duration: 1.2,
          loop: true,
        },
      );

      // 2. Synchronize coordinates and dimensions if image moves/rotates/scales/resizes
      const syncPosition = () => {
        if (!loadingGroup || !rawNode || !rawNode.parent) return;
        const newW = rawNode.width || 200;
        const newH = rawNode.height || 200;

        loadingGroup.set({
          x: rawNode.x,
          y: rawNode.y,
          width: newW,
          height: newH,
          scaleX: rawNode.scaleX,
          scaleY: rawNode.scaleY,
          rotation: rawNode.rotation,
        });

        mask.set({
          width: newW,
          height: newH,
          cornerRadius: rawNode.cornerRadius || 0,
        });

        loadingRect.set({
          width: newW,
          height: newH,
        });

        loadingText.set({
          x: newW / 2,
          y: newH / 2,
          fontSize: Math.max(12, Math.min(16, newW / 15)),
        });
      };

      rawNode.on(PropertyEvent.CHANGE, syncPosition);

      // 3. Start Polling
      const pollInterval = setInterval(async () => {
        if (!rawNode.parent) {
          clearInterval(pollInterval);
          delete rawNode._pollingInterval;
          delete rawNode._pollingTaskId;
          rawNode.off(PropertyEvent.CHANGE, syncPosition);
          return;
        }

        try {
          const res = await getTaskStatus(taskId);
          if (res.status === "success" && res.imageUrl) {
            clearInterval(pollInterval);
            delete rawNode._pollingInterval;
            rawNode.off(PropertyEvent.CHANGE, syncPosition);

            // Remove loading overlay
            if (rawNode._loadingGroup) {
              try {
                rawNode._loadingGroup.remove();
              } catch (_) {}
              delete rawNode._loadingGroup;
            }

            // Clean up properties
            delete rawNode.generationStatus;
            delete rawNode.taskId;
            delete rawNode.generationType;
            delete rawNode._pollingTaskId;

            // Update URL
            applyImagePaintMode(rawNode, "fit", res.imageUrl);

            // Save history
            recordHistoryDebounced();
          } else if (res.status === "error") {
            clearInterval(pollInterval);
            delete rawNode._pollingInterval;
            rawNode.off(PropertyEvent.CHANGE, syncPosition);

            // Remove loading overlay
            if (rawNode._loadingGroup) {
              try {
                rawNode._loadingGroup.remove();
              } catch (_) {}
              delete rawNode._loadingGroup;
            }

            // Clean up properties
            delete rawNode.generationStatus;
            delete rawNode.taskId;
            delete rawNode.generationType;
            delete rawNode._pollingTaskId;

            window.dispatchEvent(
              new CustomEvent("canvas:toast", {
                detail: {
                  severity: "error",
                  summary: "处理失败",
                  detail: res.error || "任务处理失败，请重试",
                },
              }),
            );
          }
        } catch (err: any) {
          console.error(`Polling failed for image task ${taskId}:`, err);
        }
      }, 2000);

      rawNode._pollingInterval = pollInterval;
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
              if (!videoNode) {
                const error: any = new Error("生成的视频缩略图无法加载，请重新生成");
                error.terminalVideoDisplayError = true;
                throw error;
              }
              clearInterval(pollInterval);
              delete node._pollingInterval;
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
          if (err.terminalVideoDisplayError || err.response?.status === 404) {
            clearInterval(pollInterval);
            delete node._pollingInterval;
            node.set({
              generationStatus: "error",
              errorMessage: err.terminalVideoDisplayError
                ? err.message
                : "任务不存在或任务已过期，请重新生成",
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

    const attachImageTaskStartListener = (node: any) => {
      node.on("task-start", () => {
        resumeImageTaskPolling(node);
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

      if (node.tag === "Frame" || node.__tag === "Frame") {
        attachFrameListeners(node);
      }

      if (
        node.tag === "Frame" ||
        node.__tag === "Frame" ||
        node.tag === "Group" ||
        node.__tag === "Group"
      ) {
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

      if (node.tag === "Image" || node.__tag === "Image") {
        attachImageTaskStartListener(node);
        if (node.generationStatus === "generating" && node.taskId) {
          resumeImageTaskPolling(node);
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
              if (String(activeWorkspaceIdRef.value ?? "") !== String(newId)) {
                return;
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
    disposeCanvasHistory();
    if (canvasApp.value) {
      canvasApp.value.destroy();
    }
  });

  const addImageGenNode = (posX?: number, posY?: number) => {
    const app = canvasApp.value;
    if (!app?.tree) return;

    let targetX = posX;
    let targetY = posY;

    if (targetX === undefined || targetY === undefined) {
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
      const coords = getNonOverlappingCoordinates({
        range: 2000,
        existingBounds,
        newWidth: 400,
        newHeight: 300,
        margin: 50,
      });
      targetX = coords.x;
      targetY = coords.y;
    } else {
      // Offset so the node centers at context menu click position
      targetX -= 200;
      targetY -= 150;
    }

    const imageGen = new ImageGen({
      x: targetX,
      y: targetY,
      width: 400,
      height: 300,
      editable: true,
    });

    app.tree.add(imageGen as any);

    if (app.editor) {
      (app.tree as any).zoom?.(imageGen as any, 300, undefined, 0.5);
      setTimeout(() => {
        app.editor.select(imageGen as any);
      }, 500);
    }

    recordHistory();
  };

  const addVideoGenNode = (posX?: number, posY?: number) => {
    const app = canvasApp.value;
    if (!app?.tree) return;

    let targetX = posX;
    let targetY = posY;

    if (targetX === undefined || targetY === undefined) {
      // 获取画布上所有元素的边界框
      const existingBounds = Array.from(app.tree.children || [])
        .filter((child: any) => child.x !== undefined && child.y !== undefined)
        .map((child: any) => ({
          x: child.x,
          y: child.y,
          width: child.width || 480,
          height: child.height || 270,
        }));

      const coords = getNonOverlappingCoordinates({
        range: 2000,
        existingBounds,
        newWidth: 480,
        newHeight: 270,
        margin: 50,
      });
      targetX = coords.x;
      targetY = coords.y;
    } else {
      // Offset so the node centers at context menu click position
      targetX -= 240;
      targetY -= 135;
    }

    const videoGen = new VideoGen({
      x: targetX,
      y: targetY,
      width: 480,
      height: 270, // default 16:9 sizing
      editable: true,
    });

    app.tree.add(videoGen as any);

    if (app.editor) {
      (app.tree as any).zoom?.(videoGen as any, 300, undefined, 0.5);
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
    beginHistoryTransaction,
    commitHistoryTransaction,
    rollbackHistoryTransaction,
    undo,
    addImageGenNode,
    addVideoGenNode,
  };
}
