import { describe, expect, it } from "vitest";
import {
  clientPointToWorld,
  createMinimapTransform,
  getViewportWorldRect,
  getZoomLayerPositionForViewportCenter,
} from "@/utils/minimapGeometry";

describe("minimap geometry", () => {
  it("maps pointer coordinates using the displayed canvas size", () => {
    const transform = createMinimapTransform(
      { x: 0, y: 0, width: 1000, height: 500 },
      { x: 0, y: 0, width: 500, height: 400 },
      { width: 200, height: 150 },
      5,
    );
    const point = clientPointToWorld(
      300,
      225,
      { left: 100, top: 75, width: 400, height: 300 },
      transform,
    );

    expect(point.worldX).toBeCloseTo(
      transform.viewBoxX + transform.viewBoxW / 2,
    );
    expect(point.worldY).toBeCloseTo(
      transform.viewBoxY + transform.viewBoxH / 2,
    );
  });

  it("keeps the view box stable when only the viewport position changes", () => {
    const content = { x: -200, y: 100, width: 1200, height: 800 };
    const first = createMinimapTransform(
      content,
      { x: 0, y: 0, width: 500, height: 400 },
      { width: 200, height: 150 },
      5,
    );
    const moved = createMinimapTransform(
      content,
      { x: 10000, y: -8000, width: 500, height: 400 },
      { width: 200, height: 150 },
      5,
    );

    expect(moved).toEqual(first);
  });

  it("converts a desired world center to the exact zoom-layer position", () => {
    const viewportSize = { width: 1000, height: 800 };
    const zoomLayer = { x: 20, y: 30, scaleX: 2, scaleY: 2 };
    const position = getZoomLayerPositionForViewportCenter(
      300,
      200,
      zoomLayer,
      viewportSize,
    );
    const viewport = getViewportWorldRect(
      { ...zoomLayer, ...position },
      viewportSize,
    );

    expect(viewport.x + viewport.width / 2).toBeCloseTo(300);
    expect(viewport.y + viewport.height / 2).toBeCloseTo(200);
  });
});
