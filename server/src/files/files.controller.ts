import { 
  Controller, 
  Get, 
  Post, 
  Param, 
  Headers, 
  UseInterceptors, 
  UploadedFiles, 
  ForbiddenException, 
  Res,
  Body,
  Req,
  UseGuards,
  ConflictException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { join, resolve } from 'node:path';
import { FilesService } from './files.service';
import { AuthGuard } from '../auth/auth.guard';
import { BillingService } from '../billing/billing.service';
import type { BillingOperationType } from '../billing/billing.types';

@Controller()
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly billing: BillingService,
  ) {}

  private getOrigin(headers: Record<string, string | undefined>): string {
    const host = headers['host'] || 'localhost:3000';
    const protocol = headers['x-forwarded-proto'] || 'http';
    return `${protocol}://${host}`;
  }

  @Post('upload-video')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'video', maxCount: 1 }
  ], {
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800') }
  }))
  async uploadVideo(
    @UploadedFiles() files: { video?: Express.Multer.File[] },
    @Headers() headers: Record<string, string>,
  ) {
    const video = files?.video?.[0] || null;
    return this.filesService.uploadVideoFile(video, this.getOrigin(headers));
  }

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "image", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ], {
      limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800') }
    }),
  )
  async upload(
    @UploadedFiles()
    files: { image?: Express.Multer.File[]; file?: Express.Multer.File[] },
    @Headers() headers: Record<string, string>,
  ) {
    const file = files?.image?.[0] || files?.file?.[0] || null;
    return this.filesService.uploadImageFile(file, this.getOrigin(headers));
  }

  @Get('files/:filename')
  async getFile(@Param('filename') filename: string, @Res() res: Response) {
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      throw new ForbiddenException("Access Denied");
    }

    const filePath = join('files', filename);
    const absolutePath = resolve(filePath);

    res.sendFile(absolutePath, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(404).send("File Not Found");
        }
      }
    });
  }

  @Post('remove-bg')
  @UseGuards(AuthGuard)
  async removeBg(
    @Body() body: { imageUrl: string },
    @Headers() headers: Record<string, string>,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: Request,
  ) {
    const { imageUrl } = body;
    return this.startBilledTask(
      (req as any).user.sub,
      idempotencyKey,
      'remove_background',
      {},
      (billingContext) => this.filesService.removeBackground(imageUrl, this.getOrigin(headers), billingContext),
    );
  }

  @Post('upscale')
  @UseGuards(AuthGuard)
  async upscale(
    @Body() body: { imageUrl: string; scale?: number },
    @Headers() headers: Record<string, string>,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: Request,
  ) {
    const { imageUrl, scale } = body;
    return this.startBilledTask(
      (req as any).user.sub,
      idempotencyKey,
      'upscale_image',
      { scale: scale || 4 },
      (billingContext) => this.filesService.upscaleImage(imageUrl, scale || 4, this.getOrigin(headers), billingContext),
    );
  }

  @Post('inpaint')
  @UseGuards(AuthGuard)
  async inpaint(
    @Body() body: { imageUrl: string; rectangles?: { left: number; top: number; width: number; height: number }[]; mask?: string; prompt?: string },
    @Headers() headers: Record<string, string>,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: Request,
  ) {
    const { imageUrl, rectangles, mask, prompt } = body;
    return this.startBilledTask(
      (req as any).user.sub,
      idempotencyKey,
      'inpaint_image',
      {},
      (billingContext) => this.filesService.inpaintImage(imageUrl, rectangles || [], this.getOrigin(headers), mask, prompt, billingContext),
    );
  }

  private async startBilledTask(
    userId: string,
    idempotencyKey: string,
    operationType: BillingOperationType,
    params: Record<string, unknown>,
    start: (billingContext: { operationId: string; userId: string }) => Promise<any>,
  ) {
    const operation = this.billing.reserve({
      userId,
      idempotencyKey,
      operation: operationType,
      params,
      metadata: { source: 'direct_api' },
    });
    if (operation.reused) {
      if (operation.taskId) {
        return { taskId: operation.taskId, billingOperationId: operation.id, replayed: true };
      }
      throw new ConflictException({
        code: 'OPERATION_IN_PROGRESS',
        operationId: operation.id,
      });
    }
    try {
      const result = await start({ operationId: operation.id, userId });
      if (!result?.taskId) throw new Error('Image operation did not return a task id');
      this.billing.attachTask(operation.id, result.taskId, userId);
      return { ...result, billingOperationId: operation.id };
    } catch (error: any) {
      this.billing.release(operation.id, error?.message || 'Failed to start image operation');
      throw error;
    }
  }

  @Post('convert-gif')
  async convertGif(
    @Body() body: { gifUrl: string },
    @Headers() headers: Record<string, string>,
  ) {
    const { gifUrl } = body;
    return this.filesService.convertGifUrl(gifUrl, this.getOrigin(headers));
  }
}
