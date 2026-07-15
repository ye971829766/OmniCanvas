import { describe, expect, test } from "bun:test";
import {
  isImageModelBitmapRequest,
  selectAgentToolNames,
} from "./tool-selection";

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

  test("routes product photo promo / background requests to image-model tools only", () => {
    for (const userInput of [
      "给这张图片画一个炫酷的背景，我要用来当宣传图",
      "把这张图的背景换成霓虹科技感场景",
      "用上传的产品图做一张宣传海报效果图",
      "Change the background of this product photo for a promo shot",
    ]) {
      const tools = selectAgentToolNames({
        userInput,
        canvasNodeCount: 0,
        hasAssets: true,
        hasCanvasImages: false,
      });

      expect(isImageModelBitmapRequest(userInput, { hasAssets: true })).toBe(
        true,
      );
      expect(tools.has("edit_image")).toBe(true);
      expect(tools.has("generate_image")).toBe(true);
      expect(tools.has("add_text")).toBe(false);
      expect(tools.has("add_rect")).toBe(false);
      expect(tools.has("add_image")).toBe(false);
      expect(tools.has("set_frame")).toBe(false);
      expect(tools.has("add_group")).toBe(false);
      expect(tools.has("auto_layout")).toBe(false);
    }
  });

  test("keeps layered canvas tools when user explicitly wants editable layout", () => {
    const tools = selectAgentToolNames({
      userInput: "用这张产品图做可编辑分层的宣传海报源文件，文字要能改",
      canvasNodeCount: 0,
      hasAssets: true,
      hasCanvasImages: false,
    });

    expect(
      isImageModelBitmapRequest(
        "用这张产品图做可编辑分层的宣传海报源文件，文字要能改",
        { hasAssets: true },
      ),
    ).toBe(false);
    expect(tools.has("add_text")).toBe(true);
    expect(tools.has("add_rect")).toBe(true);
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
    expect(tools.has("verify_design")).toBe(false);
    expect(tools.has("review_and_adjust")).toBe(false);
    expect(tools.has("set_frame")).toBe(false);
    expect(tools.has("add_frame")).toBe(false);
    expect(tools.size).toBeLessThan(20);
  });

  test("adds bounded web research to an underspecified ecommerce image request", () => {
    const tools = selectAgentToolNames({
      userInput: "帮我生成这双鞋的淘宝详情页",
      canvasNodeCount: 0,
      hasAssets: true,
    });

    expect(tools.has("generate_image")).toBe(true);
    expect(tools.has("plan_ecommerce_suite")).toBe(false);
    expect(tools.has("plan_design")).toBe(false);
    expect(tools.has("add_frame")).toBe(false);
    expect(tools.has("set_frame")).toBe(false);
    expect(tools.has("remove_background")).toBe(false);
    expect(tools.has("upscale_image")).toBe(false);
    expect(tools.has("add_text")).toBe(false);
    expect(tools.has("add_rect")).toBe(false);
    expect(tools.has("add_group")).toBe(false);
    expect(tools.has("verify_design")).toBe(false);
    expect(tools.has("review_and_adjust")).toBe(false);
    expect([...tools]).toEqual([
      "generate_image",
      "web_search",
      "web_extract",
    ]);
  });

  test("skips automatic research for a production-ready image prompt or explicit opt-out", () => {
    for (const userInput of [
      "用这双鞋做一张暗黑科技风淘宝主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字",
      "不要联网，帮我生成适合的电商主图，风格统一",
    ]) {
      const tools = selectAgentToolNames({
        userInput,
        canvasNodeCount: 0,
        hasAssets: true,
      });

      expect(tools.has("generate_image")).toBe(true);
      expect(tools.has("web_search")).toBe(false);
      expect(tools.has("web_extract")).toBe(false);
    }
  });

  test("routes ecommerce suites directly to image generation without plan_ecommerce_suite", () => {
    for (const userInput of [
      "生成一套淘宝电商图，主图+详情页",
      "Create six Amazon listing images from this product asset",
    ]) {
      const tools = selectAgentToolNames({
        userInput,
        canvasNodeCount: 0,
        hasAssets: true,
      });

      expect(tools.has("plan_ecommerce_suite")).toBe(false);
      expect(tools.has("generate_image")).toBe(true);
      expect(tools.has("add_text")).toBe(false);
      expect(tools.has("add_rect")).toBe(false);
      expect(tools.has("add_frame")).toBe(false);
      expect(tools.has("verify_design")).toBe(false);
    }
  });

  test("does not plan or verify an explicit multi-image generation request", () => {
    const tools = selectAgentToolNames({
      userInput: "生成6张不同风格的猫咪图片",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools.has("generate_image")).toBe(true);
    expect(tools.has("plan_design")).toBe(false);
    expect(tools.has("plan_ecommerce_suite")).toBe(false);
    expect(tools.has("add_frame")).toBe(false);
    expect(tools.has("verify_design")).toBe(false);
    expect(tools.has("review_and_adjust")).toBe(false);
    expect([...tools]).toEqual(["generate_image"]);
  });

  test("keeps editable layout tools only when an ecommerce source layout is requested", () => {
    const tools = selectAgentToolNames({
      userInput: "制作一套可编辑分层的淘宝详情页源文件",
      canvasNodeCount: 0,
      hasAssets: true,
    });

    expect(tools.has("plan_ecommerce_suite")).toBe(false);
    expect(tools.has("add_text")).toBe(true);
    expect(tools.has("add_rect")).toBe(true);
    expect(tools.has("add_group")).toBe(true);
    expect(tools.has("verify_design")).toBe(false);
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

  test("exposes review tools only when the user explicitly asks for review", () => {
    const tools = selectAgentToolNames({
      userInput: "Review this design and run a quality check",
      canvasNodeCount: 4,
      hasAssets: false,
    });

    expect(tools.has("verify_design")).toBe(true);
    expect(tools.has("review_and_adjust")).toBe(true);
  });
});
