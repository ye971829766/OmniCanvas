import { describe, expect, test } from "bun:test";
import {
  buildFinalImageSystemPrompt,
  compactAgentSystemPrompt,
  SYSTEM_PROMPT,
} from "./system-prompt";

describe("agent system prompt compaction", () => {
  test("replaces a persisted legacy Leafer reference", () => {
    const compacted = compactAgentSystemPrompt(
      "Custom instructions\n<leafer_api>" + "x".repeat(50_000) + "</leafer_api>",
    );

    expect(compacted).toContain("Custom instructions");
    expect(compacted).toContain("<leafer_execution_reference>");
    expect(compacted).not.toContain("<leafer_api>");
    expect(compacted.length).toBeLessThan(8_000);
  });

  test("keeps the current default prompt stable", () => {
    expect(compactAgentSystemPrompt()).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).toContain("<policy_version>image-prompt-v12</policy_version>");
    expect(SYSTEM_PROMPT).toContain("concrete visual brief");
    expect(SYSTEM_PROMPT).toContain("<policy_version>ecommerce-v16</policy_version>");
    expect(SYSTEM_PROMPT).toContain("the agent is the creative director and owns each complete production prompt");
    expect(SYSTEM_PROMPT).toContain("No server layer truncates, appends to, deduplicates, or aesthetically rewrites agent-authored prompts");
    expect(SYSTEM_PROMPT).toContain("Amazon A+ / Enhanced Brand Content");
    expect(SYSTEM_PROMPT).toContain("amazon_listing_gold_standard");
    expect(SYSTEM_PROMPT).toContain("淘宝/天猫/京东 详情页");
    expect(SYSTEM_PROMPT).toContain("FORBIDDEN: \"Add to Cart\"");
    expect(SYSTEM_PROMPT).not.toContain("One-line stubs like \"生成主图\"");
    expect(SYSTEM_PROMPT).toContain("silently check intent coverage");
    expect(SYSTEM_PROMPT).toContain("Use edit_image whenever the user asks to add, remove, replace, or change visual content");
    expect(SYSTEM_PROMPT).toContain("the single selected image, then the latest successful generated or edited image");
    expect(SYSTEM_PROMPT).toContain("<policy_version>product-photo-bitmap-v1</policy_version>");
    expect(SYSTEM_PROMPT).toContain("Prefer edit_image with source set to the exact assetId");
    expect(SYSTEM_PROMPT).toContain("Do NOT rebuild the design with add_text");
  });

  test("migrates persisted always-create-artboard guidance", () => {
    const compacted = compactAgentSystemPrompt(
      'Custom\n- The main artboard is usually "agent_frame". Use set_frame for the primary artboard.\n- Use set_frame when starting a primary new design.',
    );

    expect(compacted).toContain("Frames are optional");
    expect(compacted).toContain("Use set_frame only");
    expect(compacted).not.toContain("main artboard is usually");
  });

  test("replaces a persisted ecommerce workflow with the current core policy", () => {
    const compacted = compactAgentSystemPrompt(
      "Custom art direction\n<ecommerce_workflow>Create frames and attach add_text to product images.</ecommerce_workflow>",
    );

    expect(compacted).toContain("Custom art direction");
    expect(compacted).toContain("<policy_version>ecommerce-v16</policy_version>");
    expect(compacted).not.toContain("attach add_text to product images");
    expect(compacted).toContain("Faithfully normalize concrete briefs");
    expect(compacted).toContain("owns each complete production prompt");
    expect(compacted).toContain("Amazon A+ ≠ 淘宝详情页");
  });

  test("replaces a persisted prompt-optimization policy", () => {
    const compacted = compactAgentSystemPrompt(
      "Custom\n<image_prompt_policy>Translate every image prompt to detailed English.</image_prompt_policy>",
    );

    expect(compacted).toContain("Custom");
    expect(compacted).toContain("concrete visual brief");
    expect(compacted).toContain("image-prompt-v12");
    expect(compacted).toContain("Amazon A+ / Enhanced Brand Content");
    expect(compacted).toContain("淘宝/天猫/京东 详情页");
    expect(compacted).not.toContain("Translate every image prompt to detailed English");
  });

  test("uses a compact optimization prompt for a high-level image brief", () => {
    const prompt = buildFinalImageSystemPrompt({
      userInput: "帮我生成适合的电商主图，生成 5 张，风格要统一",
      activeTools: ["generate_image", "web_search", "web_extract"],
      preferredSourceId: "asset_product",
    });

    expect(prompt.length).toBeLessThan(5_000);
    expect(prompt).toContain("<prompt_mode>optimize</prompt_mode>");
    expect(prompt).toContain("<series_strategy>shared_variants</series_strategy>");
    // TEMP: research only when web_search is in active tools.
    expect(prompt).toContain("<research_mode>required</research_mode>");
    expect(prompt).toContain("include_images true");
    expect(prompt).toContain("must contain no image-generation call");
    expect(prompt).toContain("not competitor product identity");
    expect(prompt).toContain("You own the production prompt");
    expect(prompt).toContain("asset_product");
    expect(prompt).not.toContain("<leafer_execution_reference>");
    expect(prompt).toContain("There is no character limit or required suffix");
    expect(prompt).toContain("decide deliberately what remains consistent and what changes");
    expect(prompt).toContain("never a single soft studio packshot");
  });

  test("gives an explicit main+detail suite role-specific guidance", () => {
    const prompt = buildFinalImageSystemPrompt({
      userInput: "生成这双鞋的淘宝套图 主图+详情页",
      activeTools: ["generate_image", "web_search", "web_extract"],
      preferredSourceId: "asset_product",
    });

    expect(prompt.length).toBeLessThan(6_500);
    expect(prompt).toContain("<prompt_mode>optimize</prompt_mode>");
    expect(prompt).toContain("<series_strategy>role_suite</series_strategy>");
    expect(prompt).toContain("finished mobile product-detail PAGE modules");
    expect(prompt).toContain("NOT pure product photography");
    expect(prompt).toContain("detail_overview");
    expect(prompt).toContain("multi-section conversion layout");
    expect(prompt).toContain("You are the creative director and prompt author");
    expect(prompt).toContain("<research_mode>required</research_mode>");
    expect(prompt).toContain("Chinese ecommerce listing design");
    expect(prompt).toContain("详情页 module structure");
    expect(prompt).not.toContain("Do not search storefront listings or product-detail pages");
  });

  test("single detail-page briefs must expand into page modules not packshots", () => {
    const prompt = buildFinalImageSystemPrompt({
      userInput: "生成这双鞋的详情页",
      activeTools: ["generate_image", "web_search", "web_extract"],
      preferredSourceId: "asset_product",
    });

    expect(prompt).toContain("<prompt_mode>optimize</prompt_mode>");
    expect(prompt).toContain("finished vertical mobile product-detail PAGE");
    expect(prompt).toContain("never a single soft studio packshot");
    expect(prompt).toContain("生成这双鞋的详情页");
  });

  test("Amazon A+ briefs must not use Chinese mobile PDP / cart chrome guidance", () => {
    const prompt = buildFinalImageSystemPrompt({
      userInput: "生成亚马逊的高级A+详情页",
      activeTools: ["generate_image", "web_search", "web_extract"],
      preferredSourceId: "asset_product",
    });

    expect(prompt).toContain("<prompt_mode>optimize</prompt_mode>");
    expect(prompt).toContain("<platform_hint>amazon_a_plus</platform_hint>");
    expect(prompt).toContain("Amazon A+ / Enhanced Brand Content");
    expect(prompt).toContain("Add to Cart");
    expect(prompt).toContain("quality \"high\"");
    expect(prompt).toContain("Amazon A+ Content / Enhanced Brand Content design");
    expect(prompt).toContain("amazon_listing_gold_standard");
    expect(prompt).not.toContain("淘宝/天猫/京东 主图 composition");
    expect(prompt).not.toContain("Chinese headline hierarchy");
    expect(prompt).toContain("生成亚马逊的高级A+详情页");
  });

  test("Amazon listing suite briefs inject gold-standard gallery guidance", () => {
    const prompt = buildFinalImageSystemPrompt({
      userInput: "生成这件速干T恤的亚马逊套图",
      activeTools: ["generate_image", "web_search", "web_extract"],
      preferredSourceId: "asset_product",
    });

    expect(prompt).toContain("<prompt_mode>optimize</prompt_mode>");
    expect(prompt).toContain("<platform_hint>amazon</platform_hint>");
    expect(prompt).toContain("amazon_listing_gold_standard");
    expect(prompt).toContain("Amazon-compliant pure-white hero");
    expect(prompt).toContain("category-adaptive images");
    expect(prompt).toContain("Never fabricate a hidden side");
    expect(prompt).toContain("Do not force apparel actions");
    expect(prompt).toContain("Amazon product listing image design");
    expect(prompt).not.toContain("Chinese headline hierarchy");
    expect(prompt).toContain("生成这件速干T恤的亚马逊套图");
  });

  test("normalizes a concrete visual brief without weakening its constraints", () => {
    const userPrompt =
      "用这双鞋做一张暗黑科技风电商主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字";
    const prompt = buildFinalImageSystemPrompt({
      userInput: userPrompt,
      activeTools: ["generate_image"],
      preferredSourceId: "asset_product",
    });

    expect(prompt).toContain("<prompt_mode>normalize</prompt_mode>");
    expect(prompt).toContain("<series_strategy>shared_variants</series_strategy>");
    expect(prompt).toContain("Preserve every explicit requirement");
    expect(prompt).toContain("<prompt_normalization>");
    expect(prompt).toContain("<research_mode>skip</research_mode>");
    expect(prompt).toContain(userPrompt);
    expect(prompt).not.toContain("<prompt_optimization>");
  });

  test("uses exact wording only when the user explicitly requests verbatim handling", () => {
    const userPrompt = "不要改写提示词：黑白建筑摄影，强烈透视";
    const prompt = buildFinalImageSystemPrompt({
      userInput: userPrompt,
      activeTools: ["generate_image"],
    });

    expect(prompt).toContain("<prompt_mode>verbatim</prompt_mode>");
    expect(prompt).toContain("<prompt_verbatim>");
    expect(prompt).toContain("tool prompt must equal the cleaned user request");
  });
});
