import { describe, expect, it } from "vitest";
import {
  createAgentAttachment,
  MAX_AGENT_ATTACHMENTS,
  SUPPORTED_AGENT_IMAGE_TYPES,
} from "@/utils/agentAttachments";

describe("agent attachments", () => {
  it("keeps a conservative attachment count", () => {
    expect(MAX_AGENT_ATTACHMENTS).toBe(8);
  });

  it("accepts production image formats", () => {
    expect([...SUPPORTED_AGENT_IMAGE_TYPES]).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  it("rejects unsupported image formats before conversion", async () => {
    const file = new File(["gif"], "product.gif", { type: "image/gif" });
    await expect(createAgentAttachment(file)).rejects.toThrow("PNG、JPEG 和 WebP");
  });
});
