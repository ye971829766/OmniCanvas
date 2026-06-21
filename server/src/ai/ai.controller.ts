import { 
  Controller, 
  Get, 
  Post, 
  Param, 
  Query,
  Body, 
  Headers, 
  UseInterceptors, 
  UploadedFiles, 
  BadRequestException 
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import type { GenerateImageJsonRequest, GenerateVideoJsonRequest } from '../types';

@Controller()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  private getOrigin(headers: Record<string, string | undefined>): string {
    const host = headers['host'] || 'localhost:3000';
    const protocol = headers['x-forwarded-proto'] || 'http';
    return `${protocol}://${host}`;
  }

  @Get("models/image/:model/options")
  async getImageModelOptions(@Param("model") model: string) {
    const decodedModel = decodeURIComponent(model || "").trim();
    if (!decodedModel) {
      throw new BadRequestException("Missing image model");
    }
    return this.aiService.getImageModelOptions(decodedModel);
  }

  @Get("models/video/:model/options")
  async getVideoModelOptions(@Param("model") model: string) {
    const decodedModel = decodeURIComponent(model || "").trim();
    if (!decodedModel) {
      throw new BadRequestException("Missing video model");
    }
    return this.aiService.getVideoModelOptions(decodedModel);
  }

  @Get("models/:type")
  async getModels(@Param("type") type: string, @Query("scope") scope?: string) {
    if (type !== "image" && type !== "chat" && type !== "video") {
      throw new BadRequestException("Model type must be 'image', 'chat', or 'video'");
    }
    return this.aiService.getYunwuModels(type, { filterForDisplay: scope !== "all" });
  }

  @Post("chat")
  async chat(@Body() body: any) {
    return this.aiService.chatWithYunwu(body);
  }

  @Post("generate-image")
  async generateImage(
    @Body() body: GenerateImageJsonRequest,
    @Headers() headers: Record<string, string>,
  ) {
    return this.aiService.generateImageFromJson(body, this.getOrigin(headers));
  }

  @Post("generate-video")
  async generateVideo(
    @Body() body: GenerateVideoJsonRequest,
    @Headers() headers: Record<string, string>,
  ) {
    return this.aiService.generateVideoFromJson(body, this.getOrigin(headers));
  }

  @Get("tasks/:id")
  getTaskStatus(@Param("id") id: string) {
    return this.aiService.getTaskStatus(id);
  }
}
