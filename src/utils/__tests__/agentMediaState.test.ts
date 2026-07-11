import { describe, expect, it } from "vitest";
import {
  deriveTerminalMediaNodeState,
} from "../agentMediaState";

describe("agent media terminal state", () => {
  it("turns a settled image result into a done state with its URL", () => {
    expect(
      deriveTerminalMediaNodeState(
        "edit_image",
        {
          refId: "image-1",
          taskId: "task-1",
          status: "success",
          url: "https://example.com/final.png",
        },
        { refId: "image-1", type: "image", status: "generating" },
      ),
    ).toEqual({
      refId: "image-1",
      type: "image",
      status: "done",
      url: "https://example.com/final.png",
      thumbnailUrl: undefined,
      error: undefined,
    });
  });

  it("handles wrapped terminal errors", () => {
    const state = deriveTerminalMediaNodeState("generate_image", {
      type: "json",
      value: {
        refId: "image-2",
        status: "error",
        error: "provider failed",
      },
    });

    expect(state).toMatchObject({
      refId: "image-2",
      status: "error",
      error: "provider failed",
    });
  });
});
