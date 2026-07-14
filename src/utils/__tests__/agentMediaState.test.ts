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
      // Image results may reuse the media URL as a poster/thumbnail
      thumbnailUrl: "https://example.com/final.png",
      error: undefined,
    });
  });

  it("keeps video poster separate from the video file URL", () => {
    expect(
      deriveTerminalMediaNodeState(
        "generate_video",
        {
          refId: "vid-1",
          status: "success",
          videoUrl: "https://example.com/clip.mp4",
          thumbnailUrl: "https://example.com/poster.jpg",
        },
        { refId: "vid-1", type: "video", status: "generating" },
      ),
    ).toEqual({
      refId: "vid-1",
      type: "video",
      status: "done",
      url: "https://example.com/clip.mp4",
      thumbnailUrl: "https://example.com/poster.jpg",
      error: undefined,
    });
  });

  it("does not use a bare video URL as the image poster", () => {
    const state = deriveTerminalMediaNodeState("generate_video", {
      refId: "vid-2",
      status: "success",
      url: "https://example.com/only.mp4",
    });
    expect(state).toMatchObject({
      refId: "vid-2",
      type: "video",
      status: "done",
      url: "https://example.com/only.mp4",
    });
    expect(state?.thumbnailUrl).toBeUndefined();
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
