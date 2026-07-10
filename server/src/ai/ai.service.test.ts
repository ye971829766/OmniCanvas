import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AiService } from "./ai.service";

function createService() {
  return new AiService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe("AiService.uploadImageToHost", () => {
  const originalFetch = globalThis.fetch;
  const originalUploadUrl = process.env.IMAGE_HOST_UPLOAD_URL;
  const originalCdnDomain = process.env.IMAGE_HOST_CDN_DOMAIN;

  beforeEach(() => {
    process.env.IMAGE_HOST_UPLOAD_URL = "https://img.scdn.io/api/v1.php";
    process.env.IMAGE_HOST_CDN_DOMAIN = "cloudflareimg.cdn.sn";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalUploadUrl === undefined) delete process.env.IMAGE_HOST_UPLOAD_URL;
    else process.env.IMAGE_HOST_UPLOAD_URL = originalUploadUrl;
    if (originalCdnDomain === undefined) delete process.env.IMAGE_HOST_CDN_DOMAIN;
    else process.env.IMAGE_HOST_CDN_DOMAIN = originalCdnDomain;
  });

  test("keeps already-public image URLs unchanged", async () => {
    const fetchMock = mock(() => Promise.reject(new Error("unexpected fetch")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await createService().uploadImageToHost(
      "https://example.com/product.png",
    );

    expect(result).toBe("https://example.com/product.png");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("uploads localhost images to scdn with multipart form data", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    globalThis.fetch = mock(async (input, init) => {
      calls.push({ input, init });
      if (calls.length === 1) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return Response.json({
        success: true,
        url: "https://cloudflareimg.cdn.sn/i/product.webp",
      });
    }) as unknown as typeof fetch;

    const service = createService();
    const source = "http://localhost:3000/files/product.png";
    const result = await service.uploadImageToHost(source);
    const cachedResult = await service.uploadImageToHost(source);

    expect(result).toBe("https://cloudflareimg.cdn.sn/i/product.webp");
    expect(cachedResult).toBe(result);
    expect(calls).toHaveLength(2);
    const readCall = calls[0];
    const uploadCall = calls[1];
    if (!readCall || !uploadCall) throw new Error("Expected two fetch calls");
    expect(readCall.input).toBe("http://localhost:3000/files/product.png");
    expect(uploadCall.input).toBe("https://img.scdn.io/api/v1.php");
    expect(uploadCall.init?.body).toBeInstanceOf(FormData);
    const form = uploadCall.init?.body as FormData;
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect(form.get("cdn_domain")).toBe("cloudflareimg.cdn.sn");
    expect(form.get("storage_destination")).toBe("local");
  });

  test("falls back to inline image data when the image host fails", async () => {
    globalThis.fetch = mock(async (_input, init) => {
      if (!init) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return Response.json(
        { success: false, message: "temporary failure" },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    const result = await createService().uploadImageToHost(
      "http://127.0.0.1:3000/files/product.png",
    );

    expect(result).toBe("data:image/png;base64,AQID");
  });
});
