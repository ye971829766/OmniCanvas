import { describe, expect, test } from "bun:test";
import {
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
    expect(compacted.length).toBeLessThan(5_000);
  });

  test("keeps the current default prompt stable", () => {
    expect(compactAgentSystemPrompt()).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).toContain("<policy_version>image-prompt-v2</policy_version>");
    expect(SYSTEM_PROMPT).toContain("Use your judgment to write the prompt");
    expect(SYSTEM_PROMPT).toContain("Prefer the user's original wording");
    expect(SYSTEM_PROMPT).toContain("<policy_version>ecommerce-v5</policy_version>");
    expect(SYSTEM_PROMPT).toContain("Never use planning tools for ecommerce image generation");
    expect(SYSTEM_PROMPT).toContain("There is no automatic quality-gate phase");
    expect(SYSTEM_PROMPT).not.toContain("Use plan_ecommerce_suite first");
    expect(SYSTEM_PROMPT).toContain("Use edit_image whenever the user asks to add, remove, replace, or change visual content");
    expect(SYSTEM_PROMPT).toContain("the single selected image, then the latest successful generated or edited image");
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
    expect(compacted).toContain("<policy_version>ecommerce-v5</policy_version>");
    expect(compacted).not.toContain("attach add_text to product images");
    expect(compacted).toContain("Send every ecommerce image request directly to generate_image");
    expect(compacted).toContain("Do not call verify_design");
  });

  test("replaces a persisted prompt-optimization policy", () => {
    const compacted = compactAgentSystemPrompt(
      "Custom\n<image_prompt_policy>Translate every image prompt to detailed English.</image_prompt_policy>",
    );

    expect(compacted).toContain("Custom");
    expect(compacted).toContain("Use your judgment to write the prompt");
    expect(compacted).not.toContain("Translate every image prompt");
  });
});
