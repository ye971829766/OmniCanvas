import { describe, expect, mock, test } from "bun:test";
import { FilesService } from "./files.service";

function createService() {
  return new FilesService({} as any, {} as any, {} as any);
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

describe("FilesService WebP upload normalization", () => {
  test("detects WebP from mime, extension, and RIFF magic", () => {
    const service = createService();
    const magic = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(service.isWebpImage(Buffer.alloc(0), "image/webp", "a.png")).toBe(true);
    expect(service.isWebpImage(Buffer.alloc(0), "image/png", "photo.webp")).toBe(true);
    expect(service.isWebpImage(magic, "application/octet-stream", "blob")).toBe(true);
    expect(service.isWebpImage(Buffer.from([1, 2, 3]), "image/png", "a.png")).toBe(false);
  });

  test("converts WebP uploads to JPEG before persisting", async () => {
    const service = createService() as any;
    const jpegPayload = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    service.convertWebpBufferToJpeg = mock(async () => jpegPayload);
    const written: Array<{ path: string; data: Buffer | Uint8Array }> = [];
    const originalWrite = Bun.write;
    // @ts-expect-error test override
    Bun.write = mock(async (path: string, data: any) => {
      written.push({ path: String(path), data });
      return data?.length ?? 0;
    });

    try {
      const result = await service.uploadImageFile(
        {
          buffer: Buffer.from("fake-webp"),
          mimetype: "image/webp",
          originalname: "shot.webp",
        } as any,
        "http://localhost:3000",
      );

      expect(service.convertWebpBufferToJpeg).toHaveBeenCalledTimes(1);
      expect(written).toHaveLength(1);
      expect(written[0]?.path.endsWith(".jpg")).toBe(true);
      expect(Buffer.from(written[0]!.data)).toEqual(jpegPayload);
      expect(result.imageUrl.endsWith(".jpg")).toBe(true);
      expect(result.url).toBe(result.imageUrl);
    } finally {
      Bun.write = originalWrite;
    }
  });

  test("leaves non-WebP uploads unchanged", async () => {
    const service = createService() as any;
    service.convertWebpBufferToJpeg = mock(async () => {
      throw new Error("should not convert");
    });
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const written: string[] = [];
    const originalWrite = Bun.write;
    // @ts-expect-error test override
    Bun.write = mock(async (path: string) => {
      written.push(String(path));
      return 0;
    });

    try {
      const result = await service.uploadImageFile(
        {
          buffer: pngBytes,
          mimetype: "image/png",
          originalname: "logo.png",
        } as any,
        "http://localhost:3000",
      );

      expect(service.convertWebpBufferToJpeg).not.toHaveBeenCalled();
      expect(written[0]?.endsWith(".png")).toBe(true);
      expect(result.imageUrl.endsWith(".png")).toBe(true);
    } finally {
      Bun.write = originalWrite;
    }
  });
});
