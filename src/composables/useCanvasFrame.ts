import { type Ref } from "vue";
import { App, Frame, DragEvent, DropEvent, ILeaf } from "leafer-ui";

/**
 * Composable for managing frame drawing, dropping elements into frames,
 * and dragging elements out of frames with corrected coordinate calculations.
 */
export function useCanvasFrame(
  canvasAppRef: Ref<App | null>,
  activeTool: Ref<string>,
  recordHistory: () => void,
) {
  let frameDragStartHandler: ((e: any) => void) | null = null;
  let frameDragMoveHandler: ((e: any) => void) | null = null;
  let frameDragEndHandler: (() => void) | null = null;
  let drawingFrame: Frame | null = null;
  let currentMousePos: { x: number; y: number } | null = null;

  const attachFrameListeners = (frame: Frame) => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp) return;

    // Enable drag and drop behavior on the drawing frame
    frame.on(DragEvent.ENTER, () => {
      DragEvent.setData({ data: "drop-into-frame" });
      frame.set({ stroke: "var(--p-primary-color)", strokeWidth: 2 });
    });
    frame.on(DragEvent.LEAVE, () => {
      frame.set({ stroke: "", strokeWidth: 0 });
    });
    frame.on(DropEvent.DROP, (dropEvent: any) => {
      frame.set({ stroke: "", strokeWidth: 0 });
      dropEvent.list.forEach((leaf: any) => {
        if (leaf !== frame) {
          leaf.dropTo(frame);
        }
      });
    });

    // Handle element drag-out behavior
    const onEditorMove = () => {
      const editor = canvasApp.editor;
      if (!editor || !editor.list.length) return;

      editor.list.forEach((leaf: ILeaf) => {
        if (leaf.parent !== frame) return;

        const frameBounds = frame.worldBoxBounds;
        const leafWorldBounds = leaf.worldBoxBounds;

        if (!frameBounds || !leafWorldBounds) return;

        // Check if bounding boxes overlap. Completely dragged out means no overlap.
        const isOverlap =
          leafWorldBounds.x + leafWorldBounds.width >= frameBounds.x &&
          leafWorldBounds.x <= frameBounds.x + frameBounds.width &&
          leafWorldBounds.y + leafWorldBounds.height >= frameBounds.y &&
          leafWorldBounds.y <= frameBounds.y + frameBounds.height;

        if (!isOverlap) {
          if (editor.list.length === 1) {
            console.log("[Frame] removing from frame", leaf);

            const dragStartData = canvasApp.editor?.editBox?.dragStartData;
            if (dragStartData && dragStartData.point) {
              const worldPoint = { x: 0, y: 0 };
              // Convert starting position from old parent (frame) coordinate system to world coordinate system
              leaf.localToWorld(dragStartData.point, worldPoint);
              const oldRotation = leaf.rotation ?? 0;

              // Change parent to root tree
              leaf.dropTo(canvasApp.tree);

              // Convert starting world coordinates to new parent (tree) coordinate system
              leaf.worldToLocal(worldPoint, dragStartData.point);

              // Compensate rotation changes
              const rotationDiff = (leaf.rotation ?? 0) - oldRotation;
              dragStartData.rotation += rotationDiff;
            } else {
              leaf.dropTo(canvasApp.tree);
            }
            console.log("[Frame] removed from frame using dropTo");
          } else {
            leaf.dropTo(canvasApp.tree);
          }
        }
      });
    };

    canvasApp.editor.on("editor.move", onEditorMove);
  };

  const enableFrameDraw = () => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp?.view) return;
    const view = canvasApp.view as HTMLElement;

    // Clean up previous handlers
    if (frameDragStartHandler) {
      view.removeEventListener("pointerdown", frameDragStartHandler);
      frameDragStartHandler = null;
    }
    if (frameDragMoveHandler) {
      view.removeEventListener("pointermove", frameDragMoveHandler);
      frameDragMoveHandler = null;
    }
    if (frameDragEndHandler) {
      view.removeEventListener("pointerup", frameDragEndHandler);
      frameDragEndHandler = null;
    }

    frameDragStartHandler = (e: any) => {
      if (activeTool.value !== "frame") return;

      const localPoint = { x: 0, y: 0 };
      const pagePoint = canvasApp.tree.getPagePointByClient(e);
      localPoint.x = pagePoint?.x || 0;
      localPoint.y = pagePoint?.y || 0;

      drawingFrame = new Frame({
        x: localPoint.x,
        y: localPoint.y,
        width: 1,
        height: 1,
        fill: "white",
        editable: true,
      });

      attachFrameListeners(drawingFrame);

      canvasApp.tree.add(drawingFrame);
    };

    frameDragMoveHandler = (e: any) => {
      if (!drawingFrame) return;

      const localPoint = { x: 0, y: 0 };
      const pagePoint = canvasApp.tree.getPagePointByClient(e);
      localPoint.x = pagePoint?.x || 0;
      localPoint.y = pagePoint?.y || 0;

      currentMousePos = {
        x: localPoint.x,
        y: localPoint.y,
      };

      const x = currentMousePos.x;
      const y = currentMousePos.y;
      const startX = drawingFrame.x ?? 0;
      const startY = drawingFrame.y ?? 0;

      const width = Math.max(10, Math.abs(x - startX));
      const height = Math.max(10, Math.abs(y - startY));
      const finalX = Math.min(startX, x);
      const finalY = Math.min(startY, y);

      drawingFrame.set({ x: finalX, y: finalY, width, height });
    };

    frameDragEndHandler = () => {
      if (!drawingFrame) return;

      activeTool.value = "select";
      canvasApp.editor.select(drawingFrame);
      
      // Record history snapshot
      recordHistory();

      drawingFrame = null;
    };

    view.addEventListener("pointerdown", frameDragStartHandler);
    view.addEventListener("pointermove", frameDragMoveHandler);
    view.addEventListener("pointerup", frameDragEndHandler);
  };

  const disableFrameDraw = () => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp?.view) return;
    const view = canvasApp.view as HTMLElement;

    if (frameDragStartHandler) {
      view.removeEventListener("pointerdown", frameDragStartHandler);
      frameDragStartHandler = null;
    }
    if (frameDragMoveHandler) {
      view.removeEventListener("pointermove", frameDragMoveHandler);
      frameDragMoveHandler = null;
    }
    if (frameDragEndHandler) {
      view.removeEventListener("pointerup", frameDragEndHandler);
      frameDragEndHandler = null;
    }

    if (drawingFrame) {
      drawingFrame.remove();
      drawingFrame = null;
    }
  };

  return {
    enableFrameDraw,
    disableFrameDraw,
    attachFrameListeners,
  };
}
