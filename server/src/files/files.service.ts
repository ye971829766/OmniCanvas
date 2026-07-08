import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { join, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { DatabaseService } from '../database/database.service';


@Injectable()
export class FilesService implements OnModuleInit {
  constructor(private readonly dbService: DatabaseService) {}

  private MAX_IMAGE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800');
  private ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
  private UPLOAD_DIR = process.env.UPLOAD_DIR || './files';

  private baiduAccessToken: string | null = null;
  private baiduTokenExpireTime: number = 0;

  async onModuleInit() {
    await mkdir(this.UPLOAD_DIR, { recursive: true });
    console.log("FFmpeg executable path (FilesService):", ffmpegInstaller.path);
  }

  /**
   * Download a remote asset (generated image/video) the provider returned a URL
   * for. Bun's fetch occasionally rejects otherwise-valid provider CDNs with
   * "unknown certificate verification error" (incomplete chain / unknown CA).
   * We try a normal verified fetch first, and only on a TLS/cert error retry
   * with verification disabled — scoped to downloading the result asset, never
   * to the channel API calls that carry credentials.
   */
  private async downloadAsset(url: string): Promise<Response> {
    try {
      return await fetch(url);
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
      return await fetch(url, { tls: { rejectUnauthorized: false } } as any);
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
        HttpStatus.BAD_REQUEST
      );
    }
    if (image.size > this.MAX_IMAGE_SIZE) {
      throw new HttpException(
        { error: `Image ${index + 1} must be 50MB or smaller` },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async saveImageFromBase64(base64: string, outputFormat: string): Promise<string> {
    const id = crypto.randomUUID();
    const filename = `${id}.${outputFormat}`;
    const filePath = join("files", filename);
    await Bun.write(filePath, Buffer.from(base64, "base64"));
    return filename;
  }

  async saveImageFromUrl(imageUrl: string, outputFormat: string): Promise<string> {
    const response = await this.downloadAsset(imageUrl);
    if (!response.ok) {
      throw new HttpException(
        { error: "Provider returned an image URL that could not be downloaded" },
        HttpStatus.BAD_GATEWAY
      );
    }
    const extension = this.getContentTypeExtension(response.headers.get("content-type")) || outputFormat;
    const id = crypto.randomUUID();
    const filename = `${id}.${extension}`;
    const filePath = join("files", filename);
    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(filePath, arrayBuffer);
    return filename;
  }

  async saveGeneratedImage(providerResponse: any, outputFormat: string): Promise<string> {
    // 1. Try standard OpenAI DALL-E format: providerResponse.data[0]
    const image = providerResponse?.data?.[0];
    if (image) {
      if (typeof image.b64_json === "string" && image.b64_json.length > 0) {
        return this.saveImageFromBase64(image.b64_json, outputFormat);
      }
      if (typeof image.url === "string" && image.url.length > 0) {
        return this.saveImageFromUrl(image.url, outputFormat);
      }
    }

    // 2. Try OpenAI ChatCompletion multimodal format (Gemini responseModalities)
    let b64OrUrl: string | undefined;
    const choice = providerResponse?.choices?.[0];
    if (choice) {
      const message = choice.message;
      if (message) {
        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part?.type === "image_url" && typeof part.image_url?.url === "string") {
              b64OrUrl = part.image_url.url;
              break;
            }
          }
        } else if (typeof message.content === "string") {
          const contentStr = message.content.trim();
          // Extract URL or base64 from markdown image syntax: ![alt](url)
          const markdownMatch = contentStr.match(/!\[.*?\]\((.*?)\)/);
          if (markdownMatch && markdownMatch[1]) {
            b64OrUrl = markdownMatch[1].trim();
          } else if (contentStr.startsWith("data:image/") || contentStr.startsWith("http")) {
            b64OrUrl = contentStr;
          }
        }
      }
    }

    if (b64OrUrl) {
      if (b64OrUrl.startsWith("data:image/")) {
        const base64Data = b64OrUrl.replace(/^data:image\/\w+;base64,/, "");
        return this.saveImageFromBase64(base64Data, outputFormat);
      } else if (b64OrUrl.startsWith("http")) {
        return this.saveImageFromUrl(b64OrUrl, outputFormat);
      }
    }

    // 3. Try Gemini native response format: providerResponse.candidates[0].content.parts
    const candidate = providerResponse?.candidates?.[0];
    if (candidate) {
      const parts = candidate.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          const inlineData = part?.inlineData || part?.inline_data;
          if (inlineData && typeof inlineData.data === "string" && inlineData.data.length > 0) {
            return this.saveImageFromBase64(inlineData.data, outputFormat);
          }
          if (typeof part?.text === "string") {
            const textStr = part.text.trim();
            const markdownMatch = textStr.match(/!\[.*?\]\((.*?)\)/);
            if (markdownMatch && markdownMatch[1]) {
              const urlOrB64 = markdownMatch[1].trim();
              if (urlOrB64.startsWith("data:image/")) {
                const base64Data = urlOrB64.replace(/^data:image\/\w+;base64,/, "");
                return this.saveImageFromBase64(base64Data, outputFormat);
              } else if (urlOrB64.startsWith("http")) {
                return this.saveImageFromUrl(urlOrB64, outputFormat);
              }
            }
          }
        }
      }
    }

    console.log("No image found in response. Full response details:", JSON.stringify(providerResponse, null, 2));

    throw new HttpException(
      { error: "Provider response did not include an image" },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

  async uploadVideoFile(video: Express.Multer.File | null, originUrl: string) {
    if (!video) {
      throw new HttpException({ error: "Missing video file in request body (field 'video')" }, HttpStatus.BAD_REQUEST);
    }
    if (!video.mimetype.startsWith("video/")) {
      throw new HttpException({ error: "Uploaded file must be a video" }, HttpStatus.BAD_REQUEST);
    }

    const id = crypto.randomUUID();
    const extension = this.getSafeExtension(video.originalname, "mp4");
    const videoFilename = `${id}.${extension}`;
    const thumbnailFilename = `${id}.jpg`;

    const videoPath = join("files", videoFilename);
    const thumbnailPath = join("files", thumbnailFilename);

    await Bun.write(videoPath, video.buffer);

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
      throw new HttpException({
        error: "Failed to extract video thumbnail. Make sure it is a valid video file."
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      videoUrl: `${originUrl}/files/${videoFilename}`,
      thumbnailUrl: `${originUrl}/files/${thumbnailFilename}`,
    };
  }

  async downloadAndSaveVideo(videoUrl: string, originUrl: string) {
    const response = await this.downloadAsset(videoUrl);
    if (!response.ok) {
      throw new HttpException(
        { error: "Failed to download generated video from upstream" },
        HttpStatus.BAD_GATEWAY
      );
    }

    const id = crypto.randomUUID();
    const videoFilename = `${id}.mp4`;
    const thumbnailFilename = `${id}.jpg`;

    const videoPath = join("files", videoFilename);
    const thumbnailPath = join("files", thumbnailFilename);

    const arrayBuffer = await response.arrayBuffer();
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
      await Bun.write(videoPath, "");
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
    }

    return {
      videoUrl: `${originUrl}/files/${videoFilename}`,
      thumbnailUrl: `${originUrl}/files/${thumbnailFilename}`,
    };
  }

  async uploadImageFile(image: Express.Multer.File | null, originUrl: string) {
    if (!image) {
      throw new HttpException({ error: "Missing image file in request body (field 'image')" }, HttpStatus.BAD_REQUEST);
    }
    if (!image.mimetype.startsWith("image/")) {
      throw new HttpException({ error: "Uploaded file must be an image" }, HttpStatus.BAD_REQUEST);
    }

    const id = crypto.randomUUID();
    const extension = this.getSafeExtension(image.originalname, "png");
    const imageFilename = `${id}.${extension}`;
    const imagePath = join("files", imageFilename);

    await Bun.write(imagePath, image.buffer);
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
        INSERT INTO generation_tasks (id, status, data, createdAt)
        VALUES ($id, $status, $data, $createdAt)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          data = excluded.data
      `);
      stmt.run({
        $id: id,
        $status: status,
        $data: JSON.stringify(data),
        $createdAt: Date.now(),
      });
    } catch (err) {
      console.error(`Failed to save task status for ${id}:`, err);
    }
  }

  async removeBackground(imageUrl: string, originUrl: string) {
    if (!imageUrl) {
      throw new HttpException({ error: "Missing imageUrl" }, HttpStatus.BAD_REQUEST);
    }

    const taskId = crypto.randomUUID();
    this.setTaskStatus(taskId, "generating", {});

    this.runRemoveBgTaskInBackground(taskId, imageUrl, originUrl);

    return {
      type: "image",
      taskId,
      status: "generating",
    };
  }

  private async runRemoveBgTaskInBackground(taskId: string, imageUrl: string, originUrl: string) {
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

      const apiUrl = "http://j.ai.iseny.net:30088/admin-api/tools/ai-ticket/clear-bg2";

      // 3. Request
      const res = await fetch(apiUrl, {
        method: "POST",
        body: formData,
        headers: {
          "tenant-id": "1",
        },
      });

      if (!res.ok) {
        throw new Error(`Local background removal API returned HTTP ${res.status}`);
      }

      const resData: any = await res.json();
      if (!resData || resData.code !== 0) {
        throw new Error(resData?.msg || "Local background removal API returned error code");
      }

      const clearBgUrl = resData.data;
      if (!clearBgUrl) {
        throw new Error("Local background removal API did not return image URL");
      }

      // 4. Download and save locally
      const outputFormat = "png";
      const localFilename = await this.saveImageFromUrl(clearBgUrl, outputFormat);
      const localImageUrl = `${originUrl}/files/${localFilename}`;

      this.setTaskStatus(taskId, "success", {
        imageUrl: localImageUrl,
        url: localImageUrl,
      });
    } catch (err: any) {
      console.error(`[runRemoveBgTaskInBackground] Task ${taskId} failed:`, err);
      this.setTaskStatus(taskId, "error", {
        error: err.message || "背景消除失败，请重试",
      });
    }
  }

  async upscaleImage(imageUrl: string, scale: number = 4, originUrl: string) {
    if (!imageUrl) {
      throw new HttpException({ error: "Missing imageUrl" }, HttpStatus.BAD_REQUEST);
    }

    const taskId = crypto.randomUUID();
    this.setTaskStatus(taskId, "generating", {});

    this.runUpscaleTaskInBackground(taskId, imageUrl, scale, originUrl);

    return {
      type: "image",
      taskId,
      status: "generating",
    };
  }

  private async runUpscaleTaskInBackground(taskId: string, imageUrl: string, scale: number, originUrl: string) {
    let absoluteInputPath = "";
    try {
      // 1. Download image from imageUrl
      const response = await this.downloadAsset(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: HTTP ${response.status}`);
      }

      // Save image to a temporary file
      const tempId = crypto.randomUUID();
      const ext = this.getContentTypeExtension(response.headers.get("content-type")) || "png";
      const inputFilename = `temp_upscale_input_${tempId}.${ext}`;
      const inputPath = join(this.UPLOAD_DIR, inputFilename);
      absoluteInputPath = resolve(inputPath);
      const arrayBuffer = await response.arrayBuffer();
      await Bun.write(absoluteInputPath, arrayBuffer);

      // Prepare output filename
      const outputId = crypto.randomUUID();
      const outputFilename = `upscaled_${outputId}.png`;
      const outputPath = join(this.UPLOAD_DIR, outputFilename);
      const absoluteOutputPath = resolve(outputPath);

      // 2. Execute RealESRGAN
      const absoluteExePath = resolve(join("realesrgan", "realesrgan-ncnn-vulkan.exe"));
      const absoluteCwd = resolve("realesrgan");
      const args = [
        "-i", absoluteInputPath,
        "-o", absoluteOutputPath,
        "-n", "realesrgan-x4plus",
        "-s", "4", // Force native scale 4 to avoid jumbled tile/stitching bugs when scale is 2/3
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

      // Clean up temp input file
      try { await Bun.file(absoluteInputPath).delete(); } catch (_) {}
      absoluteInputPath = "";

      // Verify output file exists
      const outputFile = Bun.file(absoluteOutputPath);
      if (!(await outputFile.exists())) {
        throw new Error("Upscaled output file was not generated");
      }

      const localImageUrl = `${originUrl}/files/${outputFilename}`;

      this.setTaskStatus(taskId, "success", {
        imageUrl: localImageUrl,
        url: localImageUrl,
      });
    } catch (err: any) {
      console.error(`[runUpscaleTaskInBackground] Task ${taskId} failed:`, err);
      if (absoluteInputPath) {
        try { await Bun.file(absoluteInputPath).delete(); } catch (_) {}
      }
      this.setTaskStatus(taskId, "error", {
        error: err.message || "超分放大失败，请重试",
      });
    }
  }

  private async getBaiduAccessToken(): Promise<string> {
    if (this.baiduAccessToken && Date.now() < this.baiduTokenExpireTime) {
      return this.baiduAccessToken;
    }

    const apiKey = process.env.BAIDU_API_KEY;
    const secretKey = process.env.BAIDU_SECRET_KEY;
    if (!apiKey || !secretKey) {
      throw new Error("Missing BAIDU_API_KEY or BAIDU_SECRET_KEY in environment");
    }

    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      throw new Error(`Failed to fetch Baidu access token: HTTP ${res.status}`);
    }

    const data: any = await res.json();
    if (!data.access_token) {
      throw new Error(`Baidu token response missing access_token: ${JSON.stringify(data)}`);
    }

    this.baiduAccessToken = data.access_token;
    const expiresIn = parseInt(data.expires_in || "2592000");
    this.baiduTokenExpireTime = Date.now() + (expiresIn - 300) * 1000;

    return this.baiduAccessToken;
  }

  async inpaintImage(
    imageUrl: string,
    rectangles: { left: number; top: number; width: number; height: number }[],
    originUrl: string,
  ) {
    if (!imageUrl) {
      throw new HttpException({ error: "Missing imageUrl" }, HttpStatus.BAD_REQUEST);
    }
    if (!rectangles || !Array.isArray(rectangles) || rectangles.length === 0) {
      throw new HttpException({ error: "Missing or invalid rectangles array" }, HttpStatus.BAD_REQUEST);
    }

    const taskId = crypto.randomUUID();
    this.setTaskStatus(taskId, "generating", {});

    this.runInpaintTaskInBackground(taskId, imageUrl, rectangles, originUrl);

    return {
      type: "image",
      taskId,
      status: "generating",
    };
  }

  private async runInpaintTaskInBackground(
    taskId: string,
    imageUrl: string,
    rectangles: { left: number; top: number; width: number; height: number }[],
    originUrl: string,
  ) {
    try {
      const accessToken = await this.getBaiduAccessToken();

      const response = await this.downloadAsset(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download source image: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64Image = Buffer.from(arrayBuffer).toString("base64");

      const inpaintUrl = `https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting?access_token=${accessToken}`;
      const res = await fetch(inpaintUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64Image,
          rectangle: rectangles,
        }),
      });

      if (!res.ok) {
        throw new Error(`Baidu inpainting API returned HTTP ${res.status}`);
      }

      const resData: any = await res.json();
      if (resData.error_code) {
        throw new Error(`Baidu inpainting API error: [${resData.error_code}] ${resData.error_msg}`);
      }

      const outputBase64 = resData.image;
      if (!outputBase64) {
        throw new Error("Baidu inpainting API did not return image data");
      }

      const outputFormat = "png";
      const localFilename = await this.saveImageFromBase64(outputBase64, outputFormat);
      const localImageUrl = `${originUrl}/files/${localFilename}`;

      this.setTaskStatus(taskId, "success", {
        imageUrl: localImageUrl,
        url: localImageUrl,
      });
    } catch (err: any) {
      console.error(`[runInpaintTaskInBackground] Task ${taskId} failed:`, err);
      this.setTaskStatus(taskId, "error", {
        error: err.message || "图像修复失败，请重试",
      });
    }
  }
}
