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

  test("finishes fresh images without an automatic verification pass", () => {
    const tools = selectAgentToolNames({
      userInput: "生成一张有小猫和小狗的奇幻图片",
      canvasNodeCount: 1,
      hasAssets: false,
      hasCanvasImages: false,
    });

    expect(tools.has("generate_image")).toBe(true);
    expect(tools.has("edit_image")).toBe(false);
    expect(tools.has("verify_design")).toBe(false);
  });

  test("keeps visual verification available as an explicit opt-in", () => {
    const tools = selectAgentToolNames({
      userInput: "生成一张有小猫和小狗的奇幻图片，并做视觉质检",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools.has("generate_image")).toBe(true);
    expect(tools.has("verify_design")).toBe(true);
    expect(tools.has("edit_image")).toBe(true);
  });

  test("keeps verbatim requests generation-only and does not bind historical assets implicitly", () => {
    const tools = selectAgentToolNames({
      userInput: "不要改写提示词：黑白建筑摄影，强烈透视",
      canvasNodeCount: 0,
      hasAssets: false,
      hasHistoricalAssets: true,
    });

    expect(tools.has("generate_image")).toBe(true);
    expect(tools.has("verify_design")).toBe(false);
    expect(tools.has("edit_image")).toBe(false);
    expect(isImageModelBitmapRequest(
      "生成一张完全无关的抽象海报",
      { hasHistoricalAssets: true },
    )).toBe(false);
    expect(isImageModelBitmapRequest(
      "把之前上传的产品图改成宣传海报",
      { hasHistoricalAssets: true },
    )).toBe(true);
    expect(isImageModelBitmapRequest(
      "把上一张图换成雨夜背景",
      { hasHistoricalAssets: true },
    )).toBe(true);
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

  test("does not add research or canvas tools to an ordinary ecommerce image request", () => {
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
    expect(tools.has("edit_image")).toBe(false);
    expect(tools.has("web_search")).toBe(false);
    expect(tools.has("web_extract")).toBe(false);
  });

  test("keeps research opt-in even when Tavily is configured", () => {
    const previous = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = "test-key";
    try {
      const tools = selectAgentToolNames({
        userInput: "帮我生成这双鞋的淘宝详情页",
        canvasNodeCount: 0,
        hasAssets: true,
      });
      expect(tools.has("generate_image")).toBe(true);
      expect(tools.has("web_search")).toBe(false);
      expect(tools.has("web_extract")).toBe(false);

      const explicitResearch = selectAgentToolNames({
        userInput: "搜索同类商品的当前视觉趋势，然后生成这双鞋的淘宝详情页",
        canvasNodeCount: 0,
        hasAssets: true,
      });
      expect(explicitResearch.has("web_search")).toBe(true);
      expect(explicitResearch.has("web_extract")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.TAVILY_API_KEY;
      else process.env.TAVILY_API_KEY = previous;
    }
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
      "Generate a Shopee image suite for this product",
      "生成这个产品的 TikTok Shop 套图",
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

  test("keeps multi-image generation direct without a trailing review loop", () => {
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
    expect(tools.has("edit_image")).toBe(false);
    expect(tools.has("review_and_adjust")).toBe(false);
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
    const previous = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = "test-key";
    try {
      const tools = selectAgentToolNames({
        userInput: "Search the latest trend and make a short motion clip",
        canvasNodeCount: 0,
        hasAssets: false,
      });

      expect(tools.has("generate_video")).toBe(true);
      expect(tools.has("web_search")).toBe(true);
      expect(tools.has("web_extract")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.TAVILY_API_KEY;
      else process.env.TAVILY_API_KEY = previous;
    }
  });

  test("routes a bounded finished poster to the image model by default", () => {
    const tools = selectAgentToolNames({
      userInput: "Create a 1080x1080 product poster",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools).toEqual(new Set(["generate_image"]));
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

  test("routes multi-deliverable finished campaign images to the image model", () => {
    const tools = selectAgentToolNames({
      userInput: "Create a campaign with multiple social post variants",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools).toEqual(new Set(["generate_image"]));
  });

  test("adds visual and geometry review only on explicit request", () => {
    const tools = selectAgentToolNames({
      userInput: "Review this design and run a quality check",
      canvasNodeCount: 4,
      hasAssets: false,
    });

    expect(tools.has("verify_design")).toBe(true);
    expect(tools.has("review_and_adjust")).toBe(true);
  });

  test("routes a bare A+ request through the image-model-only workflow", () => {
    const tools = selectAgentToolNames({
      userInput: "生成基础 A+ 详情页",
      canvasNodeCount: 0,
      hasAssets: true,
    });

    expect(tools.has("generate_image")).toBe(true);
    expect(tools.has("add_text")).toBe(false);
    expect(tools.has("add_rect")).toBe(false);
    expect(tools.has("add_frame")).toBe(false);
    expect(tools.has("export_node_image")).toBe(false);
    expect(tools.has("verify_design")).toBe(false);
  });

  test("does not mistake an explicit canvas opt-out for an editable request", () => {
    const tools = selectAgentToolNames({
      userInput: "生成 A+ 详情页，不要使用可编辑画布，全部由绘图模型生成",
      canvasNodeCount: 0,
      hasAssets: true,
    });

    expect(tools).toEqual(new Set(["generate_image"]));
  });

  test("exposes canvas production tools only for an explicitly editable A+ project", () => {
    const tools = selectAgentToolNames({
      userInput: "使用画布排版制作 A+ 详情页源文件",
      canvasNodeCount: 0,
      hasAssets: true,
    });

    expect(tools.has("generate_image")).toBe(true);
    expect(tools.has("add_text")).toBe(true);
    expect(tools.has("add_rect")).toBe(true);
    expect(tools.has("add_frame")).toBe(true);
    expect(tools.has("export_node_image")).toBe(true);
  });

  test("routes ordinary finished-poster wording to the image model", () => {
    const tools = selectAgentToolNames({
      userInput: "设计一张高端香水品牌海报",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools).toEqual(new Set(["generate_image"]));
  });

  test("routes concise standalone visual briefs directly to the image model", () => {
    for (const userInput of [
      "宇航员猫，月球，电影感",
      "一只宇航员猫站在月球上",
      "an astronaut cat on the moon, cinematic",
    ]) {
      const tools = selectAgentToolNames({
        userInput,
        canvasNodeCount: 0,
        hasAssets: false,
      });
      expect(tools.has("generate_image")).toBe(true);
      expect(tools.has("add_text")).toBe(false);
      expect(tools.has("verify_design")).toBe(false);
    }
  });

  test("lets explicit drafts skip the paid visual review loop", () => {
    const tools = selectAgentToolNames({
      userInput: "快速预览一张宇航员猫图片，不用质检",
      canvasNodeCount: 0,
      hasAssets: false,
    });

    expect(tools.has("generate_image")).toBe(true);
    expect(tools.has("verify_design")).toBe(false);
    expect(tools.has("edit_image")).toBe(false);
  });
});
