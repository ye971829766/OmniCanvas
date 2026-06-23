import { 
  Controller, 
  Get, 
  Post, 
  Param, 
  Headers, 
  UseInterceptors, 
  UploadedFiles, 
  ForbiddenException, 
  Res 
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { join, resolve } from 'node:path';
import { FilesService } from './files.service';

@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

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
}
