import { describe, expect, it } from "vitest";
import {
  deriveTerminalMediaNodeState,
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
});
