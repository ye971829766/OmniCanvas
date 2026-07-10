export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapSize {
  width: number;
  height: number;
}

export interface MinimapTransform {
  viewBoxX: number;
  viewBoxY: number;
  viewBoxW: number;
  viewBoxH: number;
  elementW: number;
  elementH: number;
  worldPerPixel: number;
}

interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ZoomLayerLike {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  scale?: number | { x: number; y: number };
}

function getScale(
  zoomLayer: ZoomLayerLike,
  axis: "x" | "y",
): number {
  const direct = axis === "x" ? zoomLayer.scaleX : zoomLayer.scaleY;
  if (Number.isFinite(direct) && direct !== 0) return direct as number;

  const scale = zoomLayer.scale;
  if (typeof scale === "number" && Number.isFinite(scale) && scale !== 0) {
    return scale;
  }
  if (
    scale &&
    typeof scale === "object" &&
    Number.isFinite(scale[axis]) &&
    scale[axis] !== 0
  ) {
    return scale[axis];
  }
  return 1;
}

export function createMinimapTransform(
  contentBounds: MinimapRect | null,
  viewportBounds: MinimapRect,
  elementSize: MinimapSize,
  offsetScale: number,
): MinimapTransform {
  const baseBounds = contentBounds
    ? {
        x:
          contentBounds.x -
          Math.max(0, viewportBounds.width - contentBounds.width) / 2,
        y:
          contentBounds.y -
          Math.max(0, viewportBounds.height - contentBounds.height) / 2,
        width: Math.max(contentBounds.width, viewportBounds.width),
        height: Math.max(contentBounds.height, viewportBounds.height),
      }
    : viewportBounds;

  const elementW = Math.max(elementSize.width, 1);
  const elementH = Math.max(elementSize.height, 1);
  const fitScale = Math.max(
    baseBounds.width / elementW || 1,
    baseBounds.height / elementH || 1,
  );
  const viewWidth = fitScale * elementW;
  const viewHeight = fitScale * elementH;
  const offset = offsetScale * fitScale;
  const viewBoxX =
    baseBounds.x - (viewWidth - baseBounds.width) / 2 - offset;
  const viewBoxY =
    baseBounds.y - (viewHeight - baseBounds.height) / 2 - offset;
  const viewBoxW = viewWidth + offset * 2;
  const viewBoxH = viewHeight + offset * 2;

  return {
    viewBoxX,
    viewBoxY,
    viewBoxW,
    viewBoxH,
    elementW,
    elementH,
    worldPerPixel: Math.max(viewBoxW / elementW, viewBoxH / elementH),
  };
}

export function clientPointToWorld(
  clientX: number,
  clientY: number,
  canvasRect: ClientRectLike,
  transform: MinimapTransform,
) {
  const width = Math.max(canvasRect.width, 1);
  const height = Math.max(canvasRect.height, 1);
  return {
    worldX:
      ((clientX - canvasRect.left) / width) * transform.viewBoxW +
      transform.viewBoxX,
    worldY:
      ((clientY - canvasRect.top) / height) * transform.viewBoxH +
      transform.viewBoxY,
  };
}

export function getViewportWorldRect(
  zoomLayer: ZoomLayerLike,
  viewportSize: MinimapSize,
): MinimapRect {
  const scaleX = getScale(zoomLayer, "x");
  const scaleY = getScale(zoomLayer, "y");
  const x = zoomLayer.x ?? 0;
  const y = zoomLayer.y ?? 0;
  return {
    x: -x / scaleX,
    y: -y / scaleY,
    width: viewportSize.width / Math.abs(scaleX),
    height: viewportSize.height / Math.abs(scaleY),
  };
}

export function getZoomLayerPositionForViewportCenter(
  worldX: number,
  worldY: number,
  zoomLayer: ZoomLayerLike,
  viewportSize: MinimapSize,
) {
  const scaleX = getScale(zoomLayer, "x");
  const scaleY = getScale(zoomLayer, "y");
  return {
    x: viewportSize.width / 2 - worldX * scaleX,
    y: viewportSize.height / 2 - worldY * scaleY,
  };
}

export function minimapRectsEqual(
  a: MinimapRect | null,
  b: MinimapRect | null,
  epsilon = 0.001,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  );
}
