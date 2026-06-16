import { type Ref } from "vue";
import { App, Rect, Ellipse, Polygon, Star, Line, type UI } from "leafer-ui";
import {
  selectedShapeType,
  shapeSides,
  shapeCorners,
  shapeInnerRadius,
} from "./useShapeState";

export function useCanvasShape(
  canvasAppRef: Ref<App | null>,
  activeTool: Ref<string>,
  colorState: {
    hue: Ref<number>;
    saturation: Ref<number>;
    lightness: Ref<number>;
    alpha: Ref<number>;
  },
  thicknessState: Ref<number>,
  recordHistory: () => void,
) {
  const enableShapeDraw = () => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp?.view) return;
    const view = canvasApp.view as HTMLElement;
    let startX = 0;
    let startY = 0;
    let drawingShape: UI | null = null;
    let isDrawing = false;

    const onPointerDown = (e: PointerEvent) => {
      if (activeTool.value !== "shape") return;
      isDrawing = true;

      const pagePoint = canvasApp.tree.getPagePointByClient(e);
      startX = pagePoint?.x || 0;
      startY = pagePoint?.y || 0;

      const fillColor = `hsla(${colorState.hue.value}, ${colorState.saturation.value}%, ${colorState.lightness.value}%, ${colorState.alpha.value / 100})`;
      const strokeColor = fillColor; // Use same color for line stroke
      const strokeWidth = thicknessState.value;

      const type = selectedShapeType.value;

      if (type === "rect") {
        drawingShape = new Rect({
          x: startX,
          y: startY,
          width: 1,
          height: 1,
          fill: fillColor,
          editable: true,
        });
      } else if (type === "ellipse") {
        drawingShape = new Ellipse({
          x: startX,
          y: startY,
          width: 1,
          height: 1,
          fill: fillColor,
          editable: true,
        });
      } else if (type === "polygon") {
        drawingShape = new Polygon({
          x: startX,
          y: startY,
          width: 1,
          height: 1,
          sides: shapeSides.value,
          fill: fillColor,
          editable: true,
        } as any);
      } else if (type === "star") {
        drawingShape = new Star({
          x: startX,
          y: startY,
          width: 1,
          height: 1,
          corners: shapeCorners.value,
          innerRadius: shapeInnerRadius.value,
          fill: fillColor,
          editable: true,
        } as any);
      } else if (type === "line") {
        drawingShape = new Line({
          x: startX,
          y: startY,
          points: [0, 0, 0, 0],
          stroke: strokeColor,
          strokeWidth,
          editable: true,
        });
      }

      if (drawingShape) {
        canvasApp.tree.add(drawingShape);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawing || !drawingShape) return;

      const localPoint = { x: 0, y: 0 };

      const pagePoint = canvasApp.tree.getPagePointByClient(e);
      localPoint.x = pagePoint?.x || 0;
      localPoint.y = pagePoint?.y || 0;

      const dx = localPoint.x - startX;
      const dy = localPoint.y - startY;

      if (selectedShapeType.value === "line") {
        (drawingShape as Line).points = [0, 0, dx, dy];
      } else {
        const x = Math.min(startX, localPoint.x);
        const y = Math.min(startY, localPoint.y);
        const width = Math.max(1, Math.abs(dx));
        const height = Math.max(1, Math.abs(dy));

        drawingShape.x = x;
        drawingShape.y = y;
        drawingShape.width = width;
        drawingShape.height = height;
      }
    };

    const onPointerUp = () => {
      if (!isDrawing) return;
      isDrawing = false;

      if (drawingShape) {
        const type = selectedShapeType.value;
        let isTap = false;

        if (type === "line") {
          const points = (drawingShape as Line).points as number[];
          const dx = Math.abs(points[2]);
          const dy = Math.abs(points[3]);
          if (dx < 5 && dy < 5) {
            isTap = true;
          }
        } else {
          if (drawingShape.width! < 5 && drawingShape.height! < 5) {
            isTap = true;
          }
        }

        // Tap fallback: resize and position a default size shape centered at click
        if (isTap) {
          const defaultSize = 100;
          if (type === "line") {
            drawingShape.x = startX - defaultSize / 2;
            drawingShape.y = startY;
            (drawingShape as Line).points = [0, 0, defaultSize, 0];
          } else {
            drawingShape.x = startX - defaultSize / 2;
            drawingShape.y = startY - defaultSize / 2;
            drawingShape.width = defaultSize;
            drawingShape.height = defaultSize;
          }
        }

        // Auto select the new shape in select mode
        if (canvasApp.editor) {
          canvasApp.editor.select(drawingShape);
        }

        // Record history snapshot
        recordHistory();

        drawingShape = null;

        // Return tool back to select mode
        activeTool.value = "select";
      }
    };

    // Store references on DOM element for cleanup
    (view as any)._shapeDown = onPointerDown;
    (view as any)._shapeMove = onPointerMove;
    (view as any)._shapeUp = onPointerUp;

    view.addEventListener("pointerdown", onPointerDown);
    view.addEventListener("pointermove", onPointerMove);
    view.addEventListener("pointerup", onPointerUp);
  };

  const disableShapeDraw = () => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp?.view) return;
    const view = canvasApp.view as HTMLElement;

    const onPointerDown = (view as any)._shapeDown;
    const onPointerMove = (view as any)._shapeMove;
    const onPointerUp = (view as any)._shapeUp;

    if (onPointerDown) {
      view.removeEventListener("pointerdown", onPointerDown);
      (view as any)._shapeDown = null;
    }
    if (onPointerMove) {
      view.removeEventListener("pointermove", onPointerMove);
      (view as any)._shapeMove = null;
    }
    if (onPointerUp) {
      view.removeEventListener("pointerup", onPointerUp);
      (view as any)._shapeUp = null;
    }
  };

  return {
    enableShapeDraw,
    disableShapeDraw,
  };
}
