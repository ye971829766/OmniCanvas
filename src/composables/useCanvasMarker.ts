import { type Ref } from "vue";
import { App, Pen } from "leafer-ui";

export function useCanvasMarker(
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
  let markerPen: Pen | null = null;
  let isDrawing = false;

  const enableMarkerDraw = () => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp?.view) return;
    const view = canvasApp.view as HTMLElement;

    const onPointerDown = (e: PointerEvent) => {
      if (activeTool.value !== "marker") return;
      isDrawing = true;

      const pagePoint = canvasApp.tree.getPagePointByClient(e);
      if (!pagePoint) return;

      const strokeColor = `hsla(${colorState.hue.value}, ${colorState.saturation.value}%, ${colorState.lightness.value}%, ${colorState.alpha.value / 100})`;
      const strokeWidth = thicknessState.value;

      // Create a new Pen for drawing
      markerPen = new Pen({
        x: pagePoint.x,
        y: pagePoint.y,
        editable: true,
      });

      if (markerPen) {
        canvasApp.tree.add(markerPen);
        markerPen.setStyle({
          stroke: strokeColor,
          strokeWidth,
          strokeJoin: "round" as any,
          strokeCap: "round" as any,
        });
        markerPen.moveTo(0, 0);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawing || !markerPen) return;

      const pagePoint = canvasApp.tree.getPagePointByClient(e);
      if (!pagePoint) return;

      const localX = pagePoint.x - (markerPen.x || 0);
      const localY = pagePoint.y - (markerPen.y || 0);

      markerPen.lineTo(localX, localY);
    };

    const onPointerUp = () => {
      if (!isDrawing) return;
      isDrawing = false;

      if (markerPen) {
        // Record history snapshot
        recordHistory();
        
        // Don't auto select, just clear the reference
        markerPen = null;
      }

      // Keep marker tool active for continuous drawing
      // Don't switch back to select mode
    };

    // Store references on DOM element for cleanup
    (view as any)._markerDown = onPointerDown;
    (view as any)._markerMove = onPointerMove;
    (view as any)._markerUp = onPointerUp;

    view.addEventListener("pointerdown", onPointerDown);
    view.addEventListener("pointermove", onPointerMove);
    view.addEventListener("pointerup", onPointerUp);
  };

  const disableMarkerDraw = () => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp?.view) return;
    const view = canvasApp.view as HTMLElement;

    const onPointerDown = (view as any)._markerDown;
    const onPointerMove = (view as any)._markerMove;
    const onPointerUp = (view as any)._markerUp;

    if (onPointerDown) {
      view.removeEventListener("pointerdown", onPointerDown);
      (view as any)._markerDown = null;
    }
    if (onPointerMove) {
      view.removeEventListener("pointermove", onPointerMove);
      (view as any)._markerMove = null;
    }
    if (onPointerUp) {
      view.removeEventListener("pointerup", onPointerUp);
      (view as any)._markerUp = null;
    }

    // Clean up any in-progress drawing
    if (markerPen) {
      markerPen.remove();
      markerPen = null;
    }
    isDrawing = false;
  };

  return {
    enableMarkerDraw,
    disableMarkerDraw,
  };
}
