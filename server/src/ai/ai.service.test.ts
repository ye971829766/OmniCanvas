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

describe("AiService generation task lifecycle", () => {
  test("marks a detached image task as failed when its background promise rejects", async () => {
    const service = createService() as any;
    const statusUpdates: Array<{ id: string; status: string; data: any }> = [];
    const originalConsoleError = console.error;
    console.error = mock(() => undefined) as any;
    service.setTaskStatus = mock((id: string, status: string, data: any) => {
      statusUpdates.push({ id, status, data });
    });
    service.runGenerationTaskInBackground = mock(async () => {
      throw new Error("preflight failed");
    });

    let response: any;
    try {
      response = await service.generateImageFromJson(
        { prompt: "test product image" },
        "http://localhost:3000",
      );
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      console.error = originalConsoleError;
    }

    expect(response.status).toBe("generating");
    expect(statusUpdates).toEqual([
      { id: response.taskId, status: "generating", data: {} },
      {
        id: response.taskId,
        status: "error",
        data: { error: "preflight failed" },
      },
    ]);
  });
});

describe("AiService GPT Image 2 request defaults", () => {
  test("uses high quality and auto sizing unless explicitly overridden", () => {
    const service = createService() as any;
    const options = { defaults: { size: "1024x1024", quality: "standard" } };

    expect(service.resolveImageRequestSize("gpt-image-2", undefined, options)).toBe("auto");
    expect(service.resolveImageRequestQuality("gpt-image-2", undefined)).toBe("high");
    expect(service.resolveImageRequestQuality("gpt-image-2", "standard")).toBe("medium");
    expect(service.resolveImageRequestQuality("gpt-image-2", "hd")).toBe("high");
    expect(service.resolveImageRequestQuality("gpt-image-2", "low")).toBe("low");
    expect(service.resolveImageRequestSize("gpt-image-2", "2000x2000", options)).toBe("2000x2000");
  });
});

describe("AiService.fetchProvider", () => {
  const originalFetch = globalThis.fetch;
  const originalRetries = process.env.PROVIDER_TLS_RETRIES;
  const originalDelay = process.env.PROVIDER_TLS_RETRY_DELAY_MS;
  const originalWarn = console.warn;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    if (originalRetries === undefined) {
      delete process.env.PROVIDER_TLS_RETRIES;
    } else {
      process.env.PROVIDER_TLS_RETRIES = originalRetries;
    }
    if (originalDelay === undefined) {
      delete process.env.PROVIDER_TLS_RETRY_DELAY_MS;
    } else {
      process.env.PROVIDER_TLS_RETRY_DELAY_MS = originalDelay;
    }
  });

  test("retries transient certificate failures with verification enabled", async () => {
    const calls: Array<RequestInit | undefined> = [];
    process.env.PROVIDER_TLS_RETRIES = "2";
    process.env.PROVIDER_TLS_RETRY_DELAY_MS = "0";
    console.warn = mock(() => undefined) as any;
    globalThis.fetch = mock(async (_input, init) => {
      calls.push(init);
      if (calls.length < 3) {
        const error: any = new Error("unknown certificate verification error");
        error.code = "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR";
        throw error;
      }
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;

    const response = await createService().fetchProvider(
      "https://yunwu.ai/v1/chat/completions",
      { method: "POST", body: "{}" },
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(calls.every((init) => !(init as any)?.tls)).toBe(true);
  });

  test("does not retry non-certificate failures", async () => {
    const calls: Array<RequestInit | undefined> = [];
    process.env.PROVIDER_TLS_RETRIES = "2";
    process.env.PROVIDER_TLS_RETRY_DELAY_MS = "0";
    console.warn = mock(() => undefined) as any;
    globalThis.fetch = mock(async (_input, init) => {
      calls.push(init);
      throw new Error("provider returned malformed data");
    }) as unknown as typeof fetch;

    await expect(
      createService().fetchProvider("https://example.com/v1/chat/completions"),
    ).rejects.toThrow("provider returned malformed data");
    expect(calls).toHaveLength(1);
  });
});
