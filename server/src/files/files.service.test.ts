import { describe, expect, mock, test } from "bun:test";
import { FilesService } from "./files.service";

function createService() {
  return new FilesService({} as any, {} as any);
}

describe("FilesService.saveGeneratedImages", () => {
  test("persists every OpenAI-compatible image in response order", async () => {
    const service = createService();
    service.saveImageFromBase64 = mock(async (value: string) => `base64-${value}.png`);
    service.saveImageFromUrl = mock(async (value: string) => `url-${value.split("/").pop()}`);

    const result = await service.saveGeneratedImages({
      data: [
        { b64_json: "first" },
        { url: "https://example.com/second.png" },
        { b64_json: "third" },
      ],
    }, "png");

    expect(result).toEqual({
      filenames: ["base64-first.png", "url-second.png", "base64-third.png"],
      errors: [],
    });
  });

  test("keeps successful images when one item cannot be persisted", async () => {
    const service = createService();
    service.saveImageFromBase64 = mock(async (value: string) => {
      if (value === "broken") throw new Error("disk write failed");
      return `${value}.png`;
    });

    const result = await service.saveGeneratedImages({
      data: [
        { b64_json: "first" },
        { b64_json: "broken" },
        { b64_json: "third" },
      ],
    }, "png");

    expect(result.filenames).toEqual(["first.png", "third.png"]);
    expect(result.errors).toEqual(["disk write failed"]);
  });
});

describe("FilesService.downloadAndSaveVideo", () => {
  test("rejects a successful provider URL that returns non-video content", async () => {
    const service = createService() as any;
    service.downloadAsset = mock(async () => new Response("<html>expired</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));

    await expect(service.downloadAndSaveVideo(
      "https://example.com/result.mp4",
      "http://localhost:3000",
    )).rejects.toThrow();
  });
});
