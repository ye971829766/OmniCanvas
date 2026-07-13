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
  BadRequestException,
  ConflictException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AiService } from './ai.service';
import type { GenerateImageJsonRequest, GenerateVideoJsonRequest } from '../types';
import { AuthGuard } from '../auth/auth.guard';
import { BillingService } from '../billing/billing.service';

@Controller()
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly billing: BillingService,
  ) {}

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
  @UseGuards(AuthGuard)
  async chat(
    @Body() body: any,
    @Headers("idempotency-key") idempotencyKey: string,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const promptUpperBound = Buffer.byteLength(JSON.stringify(body?.messages || []), "utf8") + 2_048;
    const completionUpperBound = Math.max(1, Math.min(32_768, Number(body?.maxTokens || 4_096)));
    const operation = this.billing.reserve({
      userId: user.sub,
      idempotencyKey,
      operation: "llm_chat",
      params: {
        model: body?.model,
        promptTokens: promptUpperBound,
        completionTokens: completionUpperBound,
      },
      metadata: { source: "direct_chat" },
    });
    if (operation.reused) {
      return { type: "chat", replayed: true, billingOperation: operation };
    }
    try {
      const result = await this.aiService.chatWithYunwu(body, {
        userId: user.sub,
        username: user.username,
      });
      const usage: any = result.usage || {};
      const actual = this.billing.quoteForOperation(operation.id, {
        model: result.model || body?.model,
        promptTokens: usage.prompt_tokens || usage.inputTokens || 0,
        completionTokens: usage.completion_tokens || usage.outputTokens || 0,
      });
      this.billing.capture(operation.id, actual.amountMicros);
      return result;
    } catch (error: any) {
      this.billing.release(operation.id, error?.message || "Chat request failed");
      throw error;
    }
  }

  @Post("generate-image")
  @UseGuards(AuthGuard)
  async generateImage(
    @Body() body: GenerateImageJsonRequest,
    @Headers() headers: Record<string, string>,
    @Headers("idempotency-key") idempotencyKey: string,
    @Req() req: Request,
  ) {
    const preparedBody = await this.aiService.prepareImageGenerationRequest(body);
    return this.startGeneration(
      (req as any).user.sub,
      idempotencyKey,
      "image_generation",
      preparedBody as any,
      (billingContext) => this.aiService.generateImageFromJson(preparedBody, this.getOrigin(headers), billingContext),
    );
  }

  @Post("generate-video")
  @UseGuards(AuthGuard)
  async generateVideo(
    @Body() body: GenerateVideoJsonRequest,
    @Headers() headers: Record<string, string>,
    @Headers("idempotency-key") idempotencyKey: string,
    @Req() req: Request,
  ) {
    const preparedBody = await this.aiService.prepareVideoGenerationRequest(body);
    return this.startGeneration(
      (req as any).user.sub,
      idempotencyKey,
      "video_generation",
      preparedBody as any,
      (billingContext) => this.aiService.generateVideoFromJson(preparedBody, this.getOrigin(headers), billingContext),
    );
  }

  @Get("tasks/:id")
  @UseGuards(AuthGuard)
  getTaskStatus(@Param("id") id: string, @Req() req: Request) {
    return this.aiService.getTaskStatus(id, (req as any).user.sub);
  }

  private async startGeneration(
    userId: string,
    idempotencyKey: string,
    operationType: "image_generation" | "video_generation",
    params: Record<string, unknown>,
    start: (billingContext: { operationId: string; userId: string }) => Promise<any>,
  ) {
    const operation = this.billing.reserve({
      userId,
      idempotencyKey,
      operation: operationType,
      params,
      metadata: { source: "direct_api" },
    });
    if (operation.reused) {
      if (operation.taskId) return this.aiService.getTaskStatus(operation.taskId, userId);
      throw new ConflictException({
        code: "OPERATION_IN_PROGRESS",
        error: "The idempotent operation exists but has no attached task yet",
        operationId: operation.id,
      });
    }
    try {
      const result = await start({ operationId: operation.id, userId });
      if (!result?.taskId) throw new Error("Generation did not return a task id");
      this.billing.attachTask(operation.id, result.taskId, userId);
      return { ...result, billingOperationId: operation.id };
    } catch (error: any) {
      this.billing.release(operation.id, error?.message || "Failed to start generation");
      throw error;
    }
  }
}
