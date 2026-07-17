import { describe, expect, it } from "vitest";
import {
  deriveTerminalMediaNodeState,
  resolveGeneratedImageCanvasSize,
  resolveMediaDisplayUrl,
} from "../agentMediaState";

describe("resolveMediaDisplayUrl", () => {
  it("rewrites relative /files paths to the API base", () => {
    expect(resolveMediaDisplayUrl("/files/a.png")).toMatch(/\/files\/a\.png$/);
    expect(resolveMediaDisplayUrl("/files/a.png")).toContain("http");
  });

  it("rewrites absolute file URLs onto the API origin", () => {
    const resolved = resolveMediaDisplayUrl(
      "http://127.0.0.1:9999/files/product.png",
    );
    expect(resolved.endsWith("/files/product.png")).toBe(true);
    expect(resolved.startsWith("http")).toBe(true);
  });

  it("keeps data URLs", () => {
    expect(resolveMediaDisplayUrl("data:image/png;base64,AA==")).toBe(
      "data:image/png;base64,AA==",
    );
  });
});

describe("deriveTerminalMediaNodeState", () => {
  it("marks done only when a renderable URL is present", () => {
    expect(
      deriveTerminalMediaNodeState("generate_image", {
        refId: "img-1",
        status: "success",
      }),
    ).toBeUndefined();

    expect(
      deriveTerminalMediaNodeState("generate_image", {
        refId: "img-1",
        status: "success",
        url: "http://localhost:3000/files/a.png",
      }),
    ).toMatchObject({
      refId: "img-1",
      status: "done",
      type: "image",
    });
  });

  it("treats a settled URL on a generating status as done", () => {
    const state = deriveTerminalMediaNodeState("generate_image", {
      refId: "img-2",
      status: "generating",
      url: "http://localhost:3000/files/b.png",
    });
    expect(state?.status).toBe("done");
    expect(state?.url).toContain("/files/b.png");
  });

  it("treats a saved canvas slice export as terminal image media", () => {
    const state = deriveTerminalMediaNodeState("export_node_image", {
      refId: "a-plus-desktop-01",
      status: "done",
      url: "/files/a-plus-desktop-01.png",
    });
    expect(state).toMatchObject({
      refId: "a-plus-desktop-01",
      status: "done",
      type: "image",
    });
  });
});

describe("resolveGeneratedImageCanvasSize", () => {
  it("uses the finished bitmap dimensions instead of the square placeholder", () => {
    expect(resolveGeneratedImageCanvasSize(
      { width: 1024, height: 1024 },
      { width: 736, height: 2138 },
      false,
    )).toEqual({ width: 736, height: 2138 });
  });

  it("keeps a fixed frame slot when layout preservation is explicit", () => {
    expect(resolveGeneratedImageCanvasSize(
      { width: 800, height: 600 },
      { width: 736, height: 2138 },
      true,
    )).toEqual({ width: 800, height: 600 });
  });

  it("falls back to the placeholder when image metadata cannot be loaded", () => {
    expect(resolveGeneratedImageCanvasSize(
      { width: 640, height: 480 },
      undefined,
      false,
    )).toEqual({ width: 640, height: 480 });
  });
});
