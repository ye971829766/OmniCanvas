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
    expect(SYSTEM_PROMPT).toContain("<policy_version>image-prompt-v10</policy_version>");
    expect(SYSTEM_PROMPT).toContain("production-ready visual prompt");
    expect(SYSTEM_PROMPT).toContain("<policy_version>ecommerce-v14</policy_version>");
    expect(SYSTEM_PROMPT).toContain("the agent is the creative director and owns each complete production prompt");
    expect(SYSTEM_PROMPT).toContain("No server layer truncates, appends to, deduplicates, or aesthetically rewrites agent-authored prompts");
    expect(SYSTEM_PROMPT).toContain("finished vertical mobile product-detail module");
    expect(SYSTEM_PROMPT).not.toContain("One-line stubs like \"生成主图\"");
    expect(SYSTEM_PROMPT).toContain("There is no automatic quality-gate phase");
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
    expect(compacted).toContain("<policy_version>ecommerce-v14</policy_version>");
    expect(compacted).not.toContain("attach add_text to product images");
    expect(compacted).toContain("Preserve production-ready user prompts");
    expect(compacted).toContain("owns each complete production prompt");
    expect(compacted).toContain("never replace 详情页 with pure lifestyle/packshot photography");
  });

  test("replaces a persisted prompt-optimization policy", () => {
    const compacted = compactAgentSystemPrompt(
      "Custom\n<image_prompt_policy>Translate every image prompt to detailed English.</image_prompt_policy>",
    );

    expect(compacted).toContain("Custom");
    expect(compacted).toContain("production-ready visual prompt");
    expect(compacted).toContain("image-prompt-v10");
    expect(compacted).toContain("详情页 / detail page = finished vertical mobile product-detail module");
    expect(compacted).not.toContain("Translate every image prompt to detailed English");
  });

  test("uses a compact optimization prompt for a high-level image brief", () => {
    const prompt = buildFinalImageSystemPrompt({
      userInput: "帮我生成适合的电商主图，生成 5 张，风格要统一",
      activeTools: ["generate_image", "web_search", "web_extract"],
      preferredSourceId: "asset_product",
    });

    expect(prompt.length).toBeLessThan(4_500);
    expect(prompt).toContain("<prompt_mode>optimize</prompt_mode>");
    expect(prompt).toContain("<series_strategy>shared_variants</series_strategy>");
    expect(prompt).toContain("<research_mode>required</research_mode>");
    expect(prompt).toContain("include_images true");
    expect(prompt).toContain("must contain no image-generation call");
    expect(prompt).toContain("not competitor product identity");
    expect(prompt).toContain("You own the production prompt");
    expect(prompt).toContain("asset_product");
    expect(prompt).not.toContain("<leafer_execution_reference>");
    expect(prompt).toContain("There is no character limit or required suffix");
    expect(prompt).toContain("decide deliberately what remains consistent and what changes");
    expect(prompt).toContain("never rewrite it into a single soft studio product photo");
  });

  test("gives an explicit main+detail suite role-specific guidance", () => {
    const prompt = buildFinalImageSystemPrompt({
      userInput: "生成这双鞋的淘宝套图 主图+详情页",
      activeTools: ["generate_image", "web_search", "web_extract"],
      preferredSourceId: "asset_product",
    });

    expect(prompt.length).toBeLessThan(5_500);
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
    expect(prompt).toContain("never rewrite it into a single soft studio product photo");
    expect(prompt).toContain("生成这双鞋的详情页");
  });

  test("uses strict fidelity for a production-ready visual prompt", () => {
    const userPrompt =
      "用这双鞋做一张暗黑科技风电商主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字";
    const prompt = buildFinalImageSystemPrompt({
      userInput: userPrompt,
      activeTools: ["generate_image"],
      preferredSourceId: "asset_product",
    });

    expect(prompt).toContain("<prompt_mode>preserve</prompt_mode>");
    expect(prompt).toContain("<series_strategy>shared_variants</series_strategy>");
    expect(prompt).toContain("tool prompt must equal it");
    expect(prompt).toContain("<prompt_preservation>");
    expect(prompt).toContain("<research_mode>skip</research_mode>");
    expect(prompt).toContain(userPrompt);
    expect(prompt).not.toContain("<prompt_optimization>");
  });
});
