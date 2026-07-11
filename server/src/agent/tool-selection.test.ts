import { describe, expect, test } from "bun:test";
import { selectAgentToolNames } from "./tool-selection";

describe("agent tool selection", () => {
  test("exposes image editing whenever the canvas contains an image", () => {
    const chinese = selectAgentToolNames({
      userInput: "在这张图片上加一只邪恶的小猫",
      canvasNodeCount: 1,
      hasAssets: false,
      hasCanvasImages: true,
    });
    const english = selectAgentToolNames({
      userInput: "Add a black cat to this image",
      canvasNodeCount: 1,
      hasAssets: false,
      hasCanvasImages: true,
    });

    expect(chinese.has("edit_image")).toBe(true);
    expect(english.has("edit_image")).toBe(true);
  });

  test("keeps image editing out when there is no image target", () => {
    const tools = selectAgentToolNames({
      userInput: "生成一张有小猫和小狗的奇幻图片",
      canvasNodeCount: 1,
      hasAssets: false,
      hasCanvasImages: false,
    });

    expect(tools.has("edit_image")).toBe(false);
  });

  test("keeps a focused set for a normal canvas edit", () => {
    const tools = selectAgentToolNames({
      userInput: "Move the selected title and improve spacing",
      canvasNodeCount: 120,
      hasAssets: false,
    });

    expect(tools.has("query_canvas")).toBe(true);
    expect(tools.has("update_node")).toBe(true);
    expect(tools.has("generate_video")).toBe(false);
    expect(tools.has("web_search")).toBe(false);
    expect(tools.has("plan_ecommerce_suite")).toBe(false);
    expect(tools.has("set_frame")).toBe(false);
    expect(tools.has("add_frame")).toBe(false);
    expect(tools.size).toBeLessThan(20);
  });

  test("adds ecommerce and image processing capabilities when relevant", () => {
    const tools = selectAgentToolNames({
      userInput: "Create an Amazon listing image suite from this product asset",
      canvasNodeCount: 0,
      hasAssets: true,
    });

    expect(tools.has("plan_ecommerce_suite")).toBe(true);
    expect(tools.has("add_frame")).toBe(false);
    expect(tools.has("set_frame")).toBe(false);
    expect(tools.has("remove_background")).toBe(true);
    expect(tools.has("upscale_image")).toBe(true);
  });

  test("adds video and web tools only for matching requests", () => {
    const tools = selectAgentToolNames({
      userInput: "Search the latest trend and make a short motion clip",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools.has("generate_video")).toBe(true);
    expect(tools.has("web_search")).toBe(true);
    expect(tools.has("web_extract")).toBe(true);
  });

  test("uses a primary frame for a bounded single deliverable", () => {
    const tools = selectAgentToolNames({
      userInput: "Create a 1080x1080 product poster",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools.has("set_frame")).toBe(true);
    expect(tools.has("add_frame")).toBe(false);
  });

  test("keeps freeform diagrams on the root canvas", () => {
    const tools = selectAgentToolNames({
      userInput:
        "Create a detailed freeform mind map with many branches and explanatory notes arranged across the infinite canvas",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools.has("set_frame")).toBe(false);
    expect(tools.has("add_frame")).toBe(false);
    expect(tools.has("plan_design")).toBe(false);
    expect(tools.has("add_group")).toBe(true);
  });

  test("uses separate frames for multi-deliverable campaigns", () => {
    const tools = selectAgentToolNames({
      userInput: "Create a campaign with multiple social post variants",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools.has("add_frame")).toBe(true);
    expect(tools.has("plan_design")).toBe(true);
  });
});
