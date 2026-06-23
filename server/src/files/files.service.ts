import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

@Injectable()
export class FilesService implements OnModuleInit {
  private MAX_IMAGE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800');
  private ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
  private UPLOAD_DIR = process.env.UPLOAD_DIR || './files';

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
}
