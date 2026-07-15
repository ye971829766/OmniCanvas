import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AiService } from "./ai.service";

function createService(modelConfigOverrides: Record<string, unknown> = {}) {
  return new AiService(
    {
      isWebpImage: () => false,
      convertWebpBufferToJpeg: async (buf: Buffer) => buf,
    } as any,
    {} as any,
    {
      getEnabledMappingsByPurpose: async () => [],
      getImageModelId: async () => undefined,
      getConfig: async () => ({ mappings: [], imageConfigs: [] }),
      ...modelConfigOverrides,
    } as any,
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

  test("uploads localhost images to scdn as JPEG (not auto/webp)", async () => {
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
        url: "https://cloudflareimg.cdn.sn/i/product.jpg",
      });
    }) as unknown as typeof fetch;

    const service = createService();
    const source = "http://localhost:3000/files/product.png";
    const result = await service.uploadImageToHost(source);
    const cachedResult = await service.uploadImageToHost(source);

    expect(result).toBe("https://cloudflareimg.cdn.sn/i/product.jpg");
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
    expect(form.get("outputFormat")).toBe("jpg");
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

  test("ensurePublicImageUrl rejects data/local fallbacks for remote models", async () => {
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

    const service = createService();
    await expect(
      service.ensurePublicImageUrl("http://127.0.0.1:3000/files/product.png"),
    ).resolves.toBeNull();
    await expect(
      service.ensurePublicImageUrl("data:image/png;base64,AQID"),
    ).resolves.toBeNull();
    await expect(
      service.ensurePublicImageUrl("https://cdn.example.com/ok.png"),
    ).resolves.toBe("https://cdn.example.com/ok.png");
  });

  test("ensurePublicImageUrl re-hosts public WebP URLs as JPEG for model safety", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    // Minimal RIFF/WEBP header so conversion detection can run.
    const webpBytes = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4,
    ]);
    globalThis.fetch = mock(async (input, init) => {
      calls.push({ input, init });
      if (!init) {
        return new Response(webpBytes, {
          status: 200,
          headers: { "content-type": "image/webp" },
        });
      }
      return Response.json({
        success: true,
        url: "https://cloudflareimg.cdn.sn/i/converted.jpg",
      });
    }) as unknown as typeof fetch;

    const service = createService();
    (service as any).filesService = {
      isWebpImage: () => true,
      convertWebpBufferToJpeg: async () =>
        Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    };

    const result = await service.ensurePublicImageUrl(
      "https://cloudflareimg.cdn.sn/i/old.webp",
    );

    expect(result).toBe("https://cloudflareimg.cdn.sn/i/converted.jpg");
    expect(service.isWebpImageSource(result!)).toBe(false);
    const uploadCall = calls.find(
      (c) => String(c.input).includes("img.scdn.io") && c.init?.body,
    );
    expect(uploadCall).toBeTruthy();
    const form = uploadCall!.init!.body as FormData;
    expect(form.get("outputFormat")).toBe("jpg");
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
    expect(statusUpdates).toHaveLength(2);
    expect(statusUpdates[0]).toMatchObject({
      id: response.taskId,
      status: "generating",
    });
    expect(statusUpdates[0]?.data).toEqual(
      expect.objectContaining(
        response.model ? { model: response.model } : {},
      ),
    );
    expect(statusUpdates[1]).toEqual({
      id: response.taskId,
      status: "error",
      data: { error: "preflight failed" },
    });
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

describe("AiService image count validation", () => {
  test("normalizes a valid count and rejects counts outside the model limit", async () => {
    const service = createService() as any;
    service.getImageModelOptions = mock(async () => ({
      maxGenerationCount: 3,
      maxReferenceImages: 2,
      defaults: { size: "1024x1024" },
      qualities: ["standard"],
    }));

    await expect(service.prepareImageGenerationRequest({
      prompt: "three products",
      model: "test-image",
      n: 3,
    })).resolves.toMatchObject({ n: 3, model: "test-image" });
    await expect(service.prepareImageGenerationRequest({
      prompt: "too many products",
      model: "test-image",
      n: 4,
    })).rejects.toThrow();
    await expect(service.prepareImageGenerationRequest({
      prompt: "fractional products",
      model: "test-image",
      n: 1.5,
    })).rejects.toThrow();
  });

  test("uses configured default imageModel when request omits model", async () => {
    const service = createService({
      getImageModelId: async () => "configured-paint-model",
    }) as any;
    service.getImageModelOptions = mock(async () => ({
      maxGenerationCount: 1,
      maxReferenceImages: 1,
      defaults: { size: "1024x1024" },
      qualities: ["standard"],
    }));

    await expect(
      service.prepareImageGenerationRequest({ prompt: "draw a cat" }),
    ).resolves.toMatchObject({
      model: "configured-paint-model",
      n: 1,
    });
  });
});

describe("AiService video request validation", () => {
  test("normalizes valid parameters before billing and provider submission", async () => {
    const service = createService() as any;
    service.getVideoModelOptions = mock(async () => ({
      model: "video-model",
      sizes: [{ label: "16:9", value: "16x9" }],
      minSeconds: 5,
      maxSeconds: 10,
      defaults: { size: "16x9", seconds: 5 },
      supportReferenceType: "first_last",
    }));
    const first = "data:image/png;base64,AQID";
    const tail = "data:image/jpeg;base64,BAUG";

    await expect(service.prepareVideoGenerationRequest({
      prompt: " cinematic launch ",
      model: "video-model",
      seconds: "8",
      size: "16x9",
      input_reference: first,
      input_tail_reference: tail,
    })).resolves.toEqual({
      prompt: "cinematic launch",
      model: "video-model",
      seconds: "8",
      size: "16x9",
      watermark: "false",
      input_reference: first,
      input_tail_reference: tail,
    });
  });

  test("rejects ambiguous, out-of-range, and unsupported video parameters", async () => {
    const service = createService() as any;
    service.getVideoModelOptions = mock(async () => ({
      model: "video-model",
      sizes: [{ label: "16:9", value: "16x9" }],
      minSeconds: 5,
      maxSeconds: 10,
      defaults: { size: "16x9", seconds: 5 },
      supportReferenceType: "none",
    }));

    await expect(service.prepareVideoGenerationRequest({ prompt: "x", model: "video-model", seconds: "9abc" }))
      .rejects.toThrow();
    await expect(service.prepareVideoGenerationRequest({ prompt: "x", model: "video-model", seconds: "100" }))
      .rejects.toThrow();
    await expect(service.prepareVideoGenerationRequest({ prompt: "x", model: "video-model", size: "4x3" }))
      .rejects.toThrow();
    await expect(service.prepareVideoGenerationRequest({
      prompt: "x",
      model: "video-model",
      input_reference: "data:image/png;base64,AQID",
    })).rejects.toThrow();
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
