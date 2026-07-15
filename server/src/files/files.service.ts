import {
  Inject,
  Injectable,
  forwardRef,
  Optional,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { join, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { mkdir, unlink } from "node:fs/promises";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { DatabaseService } from "../database/database.service";
import type { AiService } from "../ai/ai.service";
import { AiService as AiServiceValue } from "../ai/ai.service";
import type { GenerateImageJsonRequest } from "../types";
import { deflateSync } from "zlib";
import { BillingService } from "../billing/billing.service";
import type { BillingTaskContext } from "../billing/billing.types";
import { ModelConfigService } from "../model-config/model-config.service";
import {
  baiduUpscaleImage,
  isBaiduUpscaleConfigured,
} from "./baidu-image.client";
import { userFacingGenerationError } from "../utils/user-facing-error";

@Injectable()
export class FilesService implements OnModuleInit {
  constructor(
    private readonly dbService: DatabaseService,
    @Inject(forwardRef(() => AiServiceValue))
    private readonly aiService: AiService,
    private readonly modelConfigService: ModelConfigService,
    @Optional() private readonly billingService?: BillingService,
  ) {}

  private MAX_IMAGE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "52428800");
  private ALLOWED_IMAGE_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
  private UPLOAD_DIR = process.env.UPLOAD_DIR || "./files";

  async onModuleInit() {
    await mkdir(this.UPLOAD_DIR, { recursive: true });
    console.log("FFmpeg executable path (FilesService):", ffmpegInstaller.path);
    const upscaleMode = this.resolveUpscaleProvider();
    console.log(
      `[FilesService] Upscale provider: ${upscaleMode}` +
        (upscaleMode === "baidu"
          ? " (百度图像无损放大 image_quality_enhance)"
          : " (local RealESRGAN)"),
    );
  }

  /** Prefer Baidu when keys exist; force with UPSCALE_PROVIDER=baidu|local. */
  private resolveUpscaleProvider(): "baidu" | "local" {
    const forced = (process.env.UPSCALE_PROVIDER || "").trim().toLowerCase();
    if (forced === "baidu") return "baidu";
    if (forced === "local") return "local";
    return isBaiduUpscaleConfigured() ? "baidu" : "local";
  }

  /**
   * Download a remote asset (generated image/video) the provider returned a URL
   * for. Bun's fetch occasionally rejects otherwise-valid provider CDNs with
   * "unknown certificate verification error" (incomplete chain / unknown CA).
   * We try a normal verified fetch first, and only on a TLS/cert error retry
   * with verification disabled — scoped to downloading the result asset, never
   * to the channel API calls that carry credentials.
   */
  private async downloadAsset(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err: any) {
      const msg = String(err?.message || err).toLowerCase();
      const isCertError =
        msg.includes("certificate") ||
        msg.includes("tls") ||
        msg.includes("ssl") ||
        msg.includes("self-signed") ||
        msg.includes("unable to verify");
      if (!isCertError) throw err;
      console.warn(
        `[downloadAsset] TLS verification failed for ${url}; retrying without verification`,
      );
      // Bun-specific fetch option; ignored harmlessly on Node.
      return await fetch(url, {
        ...(init || {}),
        tls: { rejectUnauthorized: false },
      } as any);
    }
  }

  getSafeExtension(filename: string, fallback: string): string {
    const extension = filename.split(".").pop()?.toLowerCase();
    return extension?.replace(/[^a-z0-9]/g, "") || fallback;
  }

  getContentTypeExtension(contentType: string | null): string | null {
    if (!contentType) return null;
    const mime = contentType.split(";")[0]?.trim().toLowerCase();
    if (mime === "image/jpeg") return "jpeg";
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    return null;
  }

  validateImageFile(image: Express.Multer.File, index: number) {
    if (!this.ALLOWED_IMAGE_TYPES.has(image.mimetype)) {
      throw new HttpException(
        { error: `Image ${index + 1} must be PNG, JPEG, or WebP` },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (image.size > this.MAX_IMAGE_SIZE) {
      throw new HttpException(
        { error: `Image ${index + 1} must be 50MB or smaller` },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async saveImageFromBase64(
    base64: string,
    outputFormat: string,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const filename = `${id}.${outputFormat}`;
    const filePath = join("files", filename);
    await Bun.write(filePath, Buffer.from(base64, "base64"));
    return filename;
  }

  async saveImageFromUrl(
    imageUrl: string,
    outputFormat: string,
  ): Promise<string> {
    const response = await this.downloadAsset(imageUrl);
    if (!response.ok) {
      throw new HttpException(
        {
          error: "Provider returned an image URL that could not be downloaded",
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    const extension =
      this.getContentTypeExtension(response.headers.get("content-type")) ||
      outputFormat;
    const id = crypto.randomUUID();
    const filename = `${id}.${extension}`;
    const filePath = join("files", filename);
    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(filePath, arrayBuffer);
    return filename;
  }

  async saveGeneratedImage(
    providerResponse: any,
    outputFormat: string,
  ): Promise<string> {
    const result = await this.saveGeneratedImages(providerResponse, outputFormat);
    const first = result.filenames[0];
    if (first) return first;
    throw new HttpException(
      { error: result.errors[0] || "Provider response did not include an image" },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async saveGeneratedImages(
    providerResponse: any,
    outputFormat: string,
  ): Promise<{ filenames: string[]; errors: string[] }> {
    const assets: Array<{ kind: "base64" | "url"; value: string }> = [];
    const addUrlOrBase64 = (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) return;
      const normalized = value.trim();
      if (normalized.startsWith("data:image/")) {
        assets.push({
          kind: "base64",
          value: normalized.replace(/^data:image\/[^;]+;base64,/, ""),
        });
      } else if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
        assets.push({ kind: "url", value: normalized });
      }
    };
    const addMarkdownImages = (value: unknown) => {
      if (typeof value !== "string") return;
      const matches = value.matchAll(/!\[.*?\]\((.*?)\)/g);
      let matched = false;
      for (const match of matches) {
        matched = true;
        addUrlOrBase64(match[1]);
      }
      if (!matched) addUrlOrBase64(value);
    };

    // OpenAI-compatible image generation/edit response.
    for (const image of Array.isArray(providerResponse?.data) ? providerResponse.data : []) {
      if (typeof image?.b64_json === "string" && image.b64_json) {
        assets.push({ kind: "base64", value: image.b64_json });
      } else {
        addUrlOrBase64(image?.url);
      }
    }

    // OpenAI-compatible multimodal chat response.
    for (const choice of Array.isArray(providerResponse?.choices) ? providerResponse.choices : []) {
      const content = choice?.message?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type === "image_url") addUrlOrBase64(part.image_url?.url);
        }
      } else {
        addMarkdownImages(content);
      }
    }

    // Native Gemini response. Preserve every image part from every candidate.
    for (const candidate of Array.isArray(providerResponse?.candidates)
      ? providerResponse.candidates
      : []) {
      for (const part of Array.isArray(candidate?.content?.parts)
        ? candidate.content.parts
        : []) {
        const inlineData = part?.inlineData || part?.inline_data;
        if (typeof inlineData?.data === "string" && inlineData.data) {
          assets.push({ kind: "base64", value: inlineData.data });
        } else {
          addMarkdownImages(part?.text);
        }
      }
    }

    if (assets.length === 0) {
      console.log(
        "No image found in response. Full response details:",
        JSON.stringify(providerResponse, null, 2),
      );
      return { filenames: [], errors: ["Provider response did not include an image"] };
    }

    const saved = await Promise.allSettled(
      assets.map((asset) =>
        asset.kind === "base64"
          ? this.saveImageFromBase64(asset.value, outputFormat)
          : this.saveImageFromUrl(asset.value, outputFormat),
      ),
    );
    const filenames: string[] = [];
    const errors: string[] = [];
    for (const result of saved) {
      if (result.status === "fulfilled") filenames.push(result.value);
      else errors.push(result.reason?.message || String(result.reason || "Failed to save image"));
    }
    return { filenames, errors };
  }

  async uploadVideoFile(video: Express.Multer.File | null, originUrl: string) {
    if (!video) {
      throw new HttpException(
        { error: "Missing video file in request body (field 'video')" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const isGif =
      video.mimetype === "image/gif" ||
      video.originalname.toLowerCase().endsWith(".gif");
    if (!video.mimetype.startsWith("video/") && !isGif) {
      throw new HttpException(
        { error: "Uploaded file must be a video or GIF" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const id = crypto.randomUUID();
    const extension = isGif
      ? "mp4"
      : this.getSafeExtension(video.originalname, "mp4");
    const videoFilename = `${id}.${extension}`;
    const thumbnailFilename = `${id}.jpg`;

    const videoPath = join("files", videoFilename);
    const thumbnailPath = join("files", thumbnailFilename);

    if (isGif) {
      const gifFilename = `${id}.gif`;
      const gifPath = join("files", gifFilename);
      await Bun.write(gifPath, video.buffer);

      // Convert GIF to MP4 using FFmpeg
      const convertProc = Bun.spawn([
        ffmpegInstaller.path,
        "-y",
        "-i",
        gifPath,
        "-movflags",
        "faststart",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        videoPath,
      ]);
      const convertExitCode = await convertProc.exited;

      // Delete temporary GIF file
      try {
        await unlink(gifPath);
      } catch (e) {
        console.warn("Failed to delete temp gif file:", gifPath, e);
      }

      if (convertExitCode !== 0) {
        const errText = await new Response(convertProc.stderr).text();
        console.error("FFmpeg conversion error:", errText);
        throw new HttpException(
          {
            error:
              "Failed to convert GIF to MP4. Make sure it is a valid GIF file.",
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else {
      await Bun.write(videoPath, video.buffer);
    }

    const proc = Bun.spawn([
      ffmpegInstaller.path,
      "-y",
      "-ss",
      "00:00:00",
      "-i",
      videoPath,
      "-vframes",
      "1",
      "-q:v",
      "2",
      thumbnailPath,
    ]);

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const errText = await new Response(proc.stderr).text();
      console.error("FFmpeg error:", errText);
      throw new HttpException(
        {
          error:
            "Failed to extract video thumbnail. Make sure it is a valid video file.",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      videoUrl: `${originUrl}/files/${videoFilename}`,
      thumbnailUrl: `${originUrl}/files/${thumbnailFilename}`,
    };
  }

  async convertGifUrl(gifUrl: string, originUrl: string) {
    const response = await this.downloadAsset(gifUrl);
    if (!response.ok) {
      throw new HttpException(
        { error: "Failed to download GIF from upstream URL" },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const id = crypto.randomUUID();
    const gifFilename = `${id}.gif`;
    const videoFilename = `${id}.mp4`;
    const thumbnailFilename = `${id}.jpg`;

    const gifPath = join("files", gifFilename);
    const videoPath = join("files", videoFilename);
    const thumbnailPath = join("files", thumbnailFilename);

    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(gifPath, arrayBuffer);

    // Convert GIF to MP4
    const convertProc = Bun.spawn([
      ffmpegInstaller.path,
      "-y",
      "-i",
      gifPath,
      "-movflags",
      "faststart",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      videoPath,
    ]);
    const convertExitCode = await convertProc.exited;

    // Delete temporary GIF file
    try {
      await unlink(gifPath);
    } catch (e) {
      console.warn("Failed to delete temp gif file:", gifPath, e);
    }

    if (convertExitCode !== 0) {
      const errText = await new Response(convertProc.stderr).text();
      console.error("FFmpeg conversion error (convertGifUrl):", errText);
      throw new HttpException(
        {
          error:
            "Failed to convert GIF to MP4. Make sure it is a valid GIF URL.",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Extract first frame thumbnail
    const thumbnailProc = Bun.spawn([
      ffmpegInstaller.path,
      "-y",
      "-ss",
      "00:00:00",
      "-i",
      videoPath,
      "-vframes",
      "1",
      "-q:v",
      "2",
      thumbnailPath,
    ]);

    const thumbnailExitCode = await thumbnailProc.exited;
    if (thumbnailExitCode !== 0) {
      const errText = await new Response(thumbnailProc.stderr).text();
      console.error("FFmpeg thumbnail error (convertGifUrl):", errText);
    }

    return {
      videoUrl: `${originUrl}/files/${videoFilename}`,
      thumbnailUrl: `${originUrl}/files/${thumbnailFilename}`,
    };
  }

  async downloadAndSaveVideo(videoUrl: string, originUrl: string) {
    const configuredMaxVideoSize = Number(process.env.MAX_VIDEO_SIZE);
    const maxVideoSize = Number.isFinite(configuredMaxVideoSize) && configuredMaxVideoSize > 0
      ? Math.floor(configuredMaxVideoSize)
      : 500 * 1024 * 1024;
    const response = await this.downloadAsset(videoUrl, {
      signal: AbortSignal.timeout(2 * 60 * 1000),
    });
    if (!response.ok) {
      throw new HttpException(
        { error: "Failed to download generated video from upstream" },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const contentType = (response.headers.get("content-type") || "").split(";")[0]!.toLowerCase();
    if (
      contentType &&
      !contentType.startsWith("video/") &&
      contentType !== "application/octet-stream"
    ) {
      throw new HttpException(
        { error: `Generated asset is not a video (${contentType})` },
        HttpStatus.BAD_GATEWAY,
      );
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxVideoSize) {
      throw new HttpException(
        { error: "Generated video exceeds the configured file-size limit" },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const id = crypto.randomUUID();
    const sourceExtension = (() => {
      try {
        return new URL(videoUrl).pathname.split(".").pop()?.toLowerCase();
      } catch {
        return undefined;
      }
    })();
    const extension = contentType === "video/webm" || sourceExtension === "webm"
      ? "webm"
      : contentType === "video/quicktime" || sourceExtension === "mov"
        ? "mov"
        : "mp4";
    const videoFilename = `${id}.${extension}`;
    const thumbnailFilename = `${id}.jpg`;

    const videoPath = join("files", videoFilename);
    const thumbnailPath = join("files", thumbnailFilename);

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > maxVideoSize) {
      throw new HttpException(
        { error: "Generated video is empty or exceeds the configured file-size limit" },
        HttpStatus.BAD_GATEWAY,
      );
    }
    await Bun.write(videoPath, arrayBuffer);

    // Extract first frame thumbnail
    const proc = Bun.spawn([
      ffmpegInstaller.path,
      "-y",
      "-ss",
      "00:00:00",
      "-i",
      videoPath,
      "-vframes",
      "1",
      "-q:v",
      "2",
      thumbnailPath,
    ]);

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const errText = await new Response(proc.stderr).text();
      console.error("FFmpeg error (downloadAndSaveVideo):", errText);
      await Promise.allSettled([unlink(videoPath), unlink(thumbnailPath)]);
      throw new HttpException(
        { error: "Generated asset is not a playable video or its thumbnail could not be created" },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      videoUrl: `${originUrl}/files/${videoFilename}`,
      thumbnailUrl: `${originUrl}/files/${thumbnailFilename}`,
    };
  }

  async generateMockVideo(originUrl: string) {
    const id = crypto.randomUUID();
    const videoFilename = `${id}.mp4`;
    const thumbnailFilename = `${id}.jpg`;

    const videoPath = join("files", videoFilename);
    const thumbnailPath = join("files", thumbnailFilename);

    const testVideoFile = Bun.file("test.mp4");
    if (await testVideoFile.exists()) {
      await Bun.write(videoPath, testVideoFile);
    } else {
      throw new HttpException(
        { error: "MOCK_VIDEO is enabled but test.mp4 is missing" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const proc = Bun.spawn([
      ffmpegInstaller.path,
      "-y",
      "-ss",
      "00:00:00",
      "-i",
      videoPath,
      "-vframes",
      "1",
      "-q:v",
      "2",
      thumbnailPath,
    ]);

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const errText = await new Response(proc.stderr).text();
      console.error("FFmpeg error (generateMockVideo):", errText);
      await Promise.allSettled([unlink(videoPath), unlink(thumbnailPath)]);
      throw new HttpException(
        { error: "MOCK_VIDEO test.mp4 is not a valid playable video" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      videoUrl: `${originUrl}/files/${videoFilename}`,
      thumbnailUrl: `${originUrl}/files/${thumbnailFilename}`,
    };
  }

  /**
   * Detect WebP from mimetype, filename extension, or RIFF/WEBP magic bytes.
   * Some clients send webp as application/octet-stream or image/* with a .webp name.
   */
  isWebpImage(
    buffer: Buffer | Uint8Array | undefined,
    mimetype?: string,
    originalName?: string,
  ): boolean {
    const mime = (mimetype || "").split(";")[0]?.trim().toLowerCase();
    if (mime === "image/webp") return true;
    const ext = originalName
      ? this.getSafeExtension(originalName, "").toLowerCase()
      : "";
    if (ext === "webp") return true;
    if (!buffer || buffer.length < 12) return false;
    // RIFF....WEBP
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }

  /**
   * Convert WebP bytes to JPEG via FFmpeg (already used for GIF→MP4).
   * Avoids shipping WebP to models that cannot decode it.
   */
  async convertWebpBufferToJpeg(buffer: Buffer | Uint8Array): Promise<Buffer> {
    const id = crypto.randomUUID();
    const inputPath = join(this.UPLOAD_DIR, `${id}.webp`);
    const outputPath = join(this.UPLOAD_DIR, `${id}.jpg`);
    await Bun.write(inputPath, buffer);

    try {
      const proc = Bun.spawn(
        [
          ffmpegInstaller.path,
          "-y",
          "-i",
          inputPath,
          // High-quality still JPEG; -frames:v 1 keeps animated WebP first frame.
          "-frames:v",
          "1",
          "-q:v",
          "2",
          outputPath,
        ],
        { stderr: "pipe" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const errText = await new Response(proc.stderr).text();
        console.error("FFmpeg WebP→JPEG conversion error:", errText);
        throw new HttpException(
          {
            error:
              "Failed to convert WebP to JPEG. Make sure it is a valid WebP image.",
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const jpegBytes = await Bun.file(outputPath).arrayBuffer();
      return Buffer.from(jpegBytes);
    } finally {
      try {
        await unlink(inputPath);
      } catch {
        /* ignore */
      }
      try {
        await unlink(outputPath);
      } catch {
        /* ignore */
      }
    }
  }

  async uploadImageFile(image: Express.Multer.File | null, originUrl: string) {
    if (!image) {
      throw new HttpException(
        { error: "Missing image file in request body (field 'image')" },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!image.mimetype.startsWith("image/")) {
      throw new HttpException(
        { error: "Uploaded file must be an image" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const id = crypto.randomUUID();
    let payload: Buffer | Uint8Array = image.buffer;
    let extension = this.getSafeExtension(image.originalname, "png");

    // Some models cannot read WebP — normalize uploads to JPEG.
    if (this.isWebpImage(image.buffer, image.mimetype, image.originalname)) {
      payload = await this.convertWebpBufferToJpeg(image.buffer);
      extension = "jpg";
    }

    const imageFilename = `${id}.${extension}`;
    const imagePath = join("files", imageFilename);

    await Bun.write(imagePath, payload);
    const imageUrl = `${originUrl}/files/${imageFilename}`;

    return {
      type: "image",
      imageUrl,
      url: imageUrl,
    };
  }

  private setTaskStatus(id: string, status: string, data: any) {
    try {
      const stmt = this.dbService.db.prepare(`
        INSERT INTO generation_tasks (id, status, data, createdAt, updatedAt)
        VALUES ($id, $status, $data, $createdAt, $updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          data = excluded.data,
          updatedAt = excluded.updatedAt
      `);
      stmt.run({
        $id: id,
        $status: status,
        $data: JSON.stringify(data),
        $createdAt: Date.now(),
        $updatedAt: Date.now(),
      });
    } catch (err) {
      console.error(`Failed to save task status for ${id}:`, err);
      return;
    }
    try {
      this.billingService?.settleTask(id, status, data?.error);
    } catch (err) {
      console.error(`Failed to settle billing for task ${id}:`, err);
    }
  }

  async removeBackground(
    imageUrl: string,
    originUrl: string,
    billingContext?: BillingTaskContext,
  ) {
    if (!imageUrl) {
      throw new HttpException(
        { error: "Missing imageUrl" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const taskId = crypto.randomUUID();
    this.setTaskStatus(taskId, "generating", {});
    if (billingContext) {
      if (!this.billingService) throw new Error("Billing service is unavailable");
      this.billingService.attachTask(billingContext.operationId, taskId, billingContext.userId);
    }

    this.runRemoveBgTaskInBackground(taskId, imageUrl, originUrl);

    return {
      type: "image",
      taskId,
      status: "generating",
    };
  }

  private async runRemoveBgTaskInBackground(
    taskId: string,
    imageUrl: string,
    originUrl: string,
  ) {
    try {
      // 1. Download image from imageUrl
      const response = await this.downloadAsset(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "image/png";
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: contentType });

      let filename = "image.png";
      const slashIndex = imageUrl.lastIndexOf("/");
      if (slashIndex !== -1) {
        const namePart = imageUrl.substring(slashIndex + 1);
        const qIndex = namePart.indexOf("?");
        filename = qIndex !== -1 ? namePart.substring(0, qIndex) : namePart;
      }
      if (!filename.includes(".")) {
        filename += ".png";
      }

      // 2. Prepare FormData
      const formData = new FormData();
      formData.append("image", blob, filename);
      formData.append("outside", "1");

      const apiUrl =
        "http://j.ai.iseny.net:30088/admin-api/tools/ai-ticket/clear-bg2";

      // 3. Request
      const res = await fetch(apiUrl, {
        method: "POST",
        body: formData,
        headers: {
          "tenant-id": "1",
        },
      });

      if (!res.ok) {
        throw new Error(
          `Local background removal API returned HTTP ${res.status}`,
        );
      }

      const resData: any = await res.json();
      if (!resData || resData.code !== 0) {
        throw new Error(
          resData?.msg || "Local background removal API returned error code",
        );
      }

      const clearBgUrl = resData.data;
      if (!clearBgUrl) {
        throw new Error(
          "Local background removal API did not return image URL",
        );
      }

      // 4. Download and save locally
      const outputFormat = "png";
      const localFilename = await this.saveImageFromUrl(
        clearBgUrl,
        outputFormat,
      );
      const localImageUrl = `${originUrl}/files/${localFilename}`;

      this.setTaskStatus(taskId, "success", {
        imageUrl: localImageUrl,
        url: localImageUrl,
      });
    } catch (err: any) {
      console.error(
        `[runRemoveBgTaskInBackground] Task ${taskId} failed:`,
        err,
      );
      this.setTaskStatus(taskId, "error", {
        error: userFacingGenerationError(
          err?.message || err,
          "背景消除失败，请稍后重试",
        ),
      });
    }
  }

  async upscaleImage(
    imageUrl: string,
    scale: number = 4,
    originUrl: string,
    billingContext?: BillingTaskContext,
  ) {
    if (!imageUrl) {
      throw new HttpException(
        { error: "Missing imageUrl" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const taskId = crypto.randomUUID();
    this.setTaskStatus(taskId, "generating", {});
    if (billingContext) {
      if (!this.billingService) throw new Error("Billing service is unavailable");
      this.billingService.attachTask(billingContext.operationId, taskId, billingContext.userId);
    }

    this.runUpscaleTaskInBackground(taskId, imageUrl, scale, originUrl);

    return {
      type: "image",
      taskId,
      status: "generating",
    };
  }

  private async runUpscaleTaskInBackground(
    taskId: string,
    imageUrl: string,
    scale: number,
    originUrl: string,
  ) {
    try {
      const provider = this.resolveUpscaleProvider();
      if (provider === "baidu") {
        await this.runBaiduUpscaleTask(taskId, imageUrl, scale, originUrl);
      } else {
        await this.runLocalRealesrganUpscaleTask(
          taskId,
          imageUrl,
          scale,
          originUrl,
        );
      }
    } catch (err: any) {
      console.error(`[runUpscaleTaskInBackground] Task ${taskId} failed:`, err);
      this.setTaskStatus(taskId, "error", {
        error: userFacingGenerationError(
          err?.message || err,
          "超分放大失败，请稍后重试",
        ),
      });
    }
  }

  /**
   * Baidu cloud lossless upscale (image_quality_enhance).
   * Each API call is fixed 2×; scale=4 runs up to two passes.
   * @see https://cloud.baidu.com/doc/IMAGEPROCESS/s/ok3bclnkg
   */
  private async runBaiduUpscaleTask(
    taskId: string,
    imageUrl: string,
    scale: number,
    originUrl: string,
  ) {
    const response = await this.downloadAsset(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get("content-type") || "image/png";
    const inputBase64 = buffer.toString("base64");

    // Baidu limit: width*height ≤ 2000×2000. Surface a clear error early when possible.
    // (We do not hard-fail if size detection is unavailable.)
    try {
      // optional: no sharp dependency; size check is best-effort via Baidu errors
      void mimeType;
    } catch {
      /* ignore */
    }

    const { base64: outBase64, appliedScale } = await baiduUpscaleImage(
      inputBase64,
      scale >= 4 ? 4 : 2,
    );

    const outputFilename = await this.saveImageFromBase64(outBase64, "png");
    const localImageUrl = `${originUrl}/files/${outputFilename}`;

    this.setTaskStatus(taskId, "success", {
      imageUrl: localImageUrl,
      url: localImageUrl,
      provider: "baidu",
      requestedScale: scale,
      appliedScale,
    });
  }

  /** Legacy local RealESRGAN path (Windows vulkan binary). */
  private async runLocalRealesrganUpscaleTask(
    taskId: string,
    imageUrl: string,
    _scale: number,
    originUrl: string,
  ) {
    let absoluteInputPath = "";
    try {
      const response = await this.downloadAsset(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: HTTP ${response.status}`);
      }

      const tempId = crypto.randomUUID();
      const ext =
        this.getContentTypeExtension(response.headers.get("content-type")) ||
        "png";
      const inputFilename = `temp_upscale_input_${tempId}.${ext}`;
      const inputPath = join(this.UPLOAD_DIR, inputFilename);
      absoluteInputPath = resolve(inputPath);
      const arrayBuffer = await response.arrayBuffer();
      await Bun.write(absoluteInputPath, arrayBuffer);

      const outputId = crypto.randomUUID();
      const outputFilename = `upscaled_${outputId}.png`;
      const outputPath = join(this.UPLOAD_DIR, outputFilename);
      const absoluteOutputPath = resolve(outputPath);

      const absoluteExePath = resolve(
        join("realesrgan", "realesrgan-ncnn-vulkan.exe"),
      );
      const absoluteCwd = resolve("realesrgan");
      const args = [
        "-i",
        absoluteInputPath,
        "-o",
        absoluteOutputPath,
        "-n",
        "realesrgan-x4plus",
        "-s",
        "4",
      ];

      const proc = Bun.spawn([absoluteExePath, ...args], {
        cwd: absoluteCwd,
      });

      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const errText = await new Response(proc.stderr).text();
        console.error("RealESRGAN error:", errText);
        throw new Error(`RealESRGAN process exited with code ${exitCode}`);
      }

      try {
        await Bun.file(absoluteInputPath).delete();
      } catch (_) {}
      absoluteInputPath = "";

      const outputFile = Bun.file(absoluteOutputPath);
      if (!(await outputFile.exists())) {
        throw new Error("Upscaled output file was not generated");
      }

      const localImageUrl = `${originUrl}/files/${outputFilename}`;

      this.setTaskStatus(taskId, "success", {
        imageUrl: localImageUrl,
        url: localImageUrl,
        provider: "local",
      });
    } catch (err: any) {
      if (absoluteInputPath) {
        try {
          await Bun.file(absoluteInputPath).delete();
        } catch (_) {}
      }
      throw err;
    }
  }

  async inpaintImage(
    imageUrl: string,
    rectangles: { left: number; top: number; width: number; height: number }[],
    originUrl: string,
    maskBase64?: string,
    prompt?: string,
    billingContext?: BillingTaskContext,
  ) {
    if (!imageUrl) {
      throw new HttpException(
        { error: "Missing imageUrl" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const taskId = crypto.randomUUID();
    this.setTaskStatus(taskId, "generating", {});
    if (billingContext) {
      if (!this.billingService) throw new Error("Billing service is unavailable");
      this.billingService.attachTask(billingContext.operationId, taskId, billingContext.userId);
    }

    this.runAiInpaintTaskInBackground(
      taskId,
      imageUrl,
      rectangles,
      originUrl,
      maskBase64,
      prompt,
    );

    return {
      type: "image",
      taskId,
      status: "generating",
    };
  }

  private async runAiInpaintTaskInBackground(
    taskId: string,
    imageUrl: string,
    rectangles: { left: number; top: number; width: number; height: number }[],
    originUrl: string,
    maskBase64?: string,
    prompt?: string,
  ) {
    try {
      let resolvedMaskBase64 = maskBase64;

      const response = await this.downloadAsset(imageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download source image: HTTP ${response.status}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get("content-type") || "image/png";
      const base64Image = imageBuffer.toString("base64");
      const base64ImageStr = `data:${mimeType};base64,${base64Image}`;

      if (!resolvedMaskBase64) {
        if (!rectangles || rectangles.length === 0) {
          throw new Error("No mask and no rectangles provided for inpainting");
        }
        const size = getImageSize(imageBuffer);
        const generatedMaskBuffer = generatePngMask(
          size.width,
          size.height,
          rectangles,
        );
        resolvedMaskBase64 = `data:image/png;base64,${generatedMaskBuffer.toString("base64")}`;
      }

      const inpaintModel = await this.modelConfigService.getInpaintModelId();
      const generateBody: GenerateImageJsonRequest = {
        prompt:
          prompt ||
          "seamlessly fill the masked area to match the surrounding image context, removing any unwanted objects or text",
        // Prefer admin-configured inpaint model; otherwise AiService falls back
        // to the first enabled image mapping / YUNWU_IMAGE_MODEL.
        model: inpaintModel,
        images: [base64ImageStr],
        mask: resolvedMaskBase64,
        outputFormat: "png",
      };

      await this.aiService.runGenerationTaskInBackground(
        taskId,
        generateBody,
        originUrl,
      );
    } catch (err: any) {
      console.error(
        `[runAiInpaintTaskInBackground] Task ${taskId} failed:`,
        err,
      );
      this.setTaskStatus(taskId, "error", {
        error: userFacingGenerationError(
          err?.message || err,
          "图像修复失败，请稍后重试",
        ),
      });
    }
  }
}

const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function crc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    const val = buf[i] ?? 0;
    const tableVal = crcTable[(crc ^ val) & 0xff] ?? 0;
    crc = tableVal ^ (crc >>> 8);
  }
  return crc ^ -1;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const chunk = new Uint8Array(4 + 4 + len + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, len);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);

  const crcInput = chunk.subarray(4, 8 + len);
  const crcVal = crc32(crcInput);
  view.setUint32(8 + len, crcVal);

  return chunk;
}

function generatePngMask(
  width: number,
  height: number,
  rectangles: { left: number; top: number; width: number; height: number }[],
): Buffer {
  const pixelData = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    pixelData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      pixelData[pixelOffset] = 255;
      pixelData[pixelOffset + 1] = 255;
      pixelData[pixelOffset + 2] = 255;
      pixelData[pixelOffset + 3] = 255;
    }
  }

  for (const rect of rectangles) {
    const xStart = Math.max(0, Math.floor(rect.left));
    const xEnd = Math.min(width, Math.floor(rect.left + rect.width));
    const yStart = Math.max(0, Math.floor(rect.top));
    const yEnd = Math.min(height, Math.floor(rect.top + rect.height));

    for (let y = yStart; y < yEnd; y++) {
      const rowOffset = y * (1 + width * 4);
      for (let x = xStart; x < xEnd; x++) {
        const pixelOffset = rowOffset + 1 + x * 4;
        pixelData[pixelOffset] = 0;
        pixelData[pixelOffset + 1] = 0;
        pixelData[pixelOffset + 2] = 0;
        pixelData[pixelOffset + 3] = 0;
      }
    }
  }

  const compressed = deflateSync(pixelData);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const signature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdrChunk = makeChunk("IHDR", ihdrData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", new Uint8Array(0));

  const totalLength =
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(totalLength);
  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  png.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  png.set(idatChunk, offset);
  offset += idatChunk.length;
  png.set(iendChunk, offset);

  return Buffer.from(png);
}

function getImageSize(buffer: Buffer): { width: number; height: number } {
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      const marker = buffer.readUInt16BE(offset);
      offset += 2;
      if (marker === 0xffd9 || marker === 0xffda) break;
      const length = buffer.readUInt16BE(offset);
      if (marker >= 0xffc0 && marker <= 0xffc3) {
        return {
          height: buffer.readUInt16BE(offset + 3),
          width: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += length;
    }
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    const type = buffer.toString("ascii", 12, 16);
    if (type === "VP8 ") {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (type === "VP8L") {
      const val = buffer.readUInt32LE(21);
      return {
        width: (val & 0x3fff) + 1,
        height: ((val >> 14) & 0x3fff) + 1,
      };
    }
    if (type === "VP8X") {
      return {
        width: (buffer.readUInt32LE(24) & 0xffffff) + 1,
        height: (buffer.readUInt32LE(27) & 0xffffff) + 1,
      };
    }
  }
  throw new Error("Unsupported image format for backend mask generation");
}
