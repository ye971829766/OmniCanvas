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
    expect(SYSTEM_PROMPT).toContain("Ecommerce image suites are independent root-canvas images");
    expect(SYSTEM_PROMPT).toContain("Do not call add_frame, set_frame, add_group, add_text, or add_rect");
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
});
