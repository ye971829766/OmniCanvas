import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Delete, 
  Param, 
  Body, 
  Query, 
  Req, 
  UseGuards 
} from '@nestjs/common';
import type { Request } from 'express';
import { AssetsService } from './assets.service';
import { OptionalAuthGuard } from '../auth/auth.guard';

@Controller('assets')
@UseGuards(OptionalAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  private getUserId(req: any): string {
    return req.user?.id || 'guest';
  }

  // ---- Group Endpoints ----

  @Get('groups')
  async getGroups(@Req() req: Request) {
    const userId = this.getUserId(req);
    return this.assetsService.getGroups(userId);
  }

  @Post('groups')
  async createGroup(@Req() req: Request, @Body() body: { name: string }) {
    const userId = this.getUserId(req);
    return this.assetsService.createGroup(userId, body.name);
  }

  @Patch('groups/:id')
  async renameGroup(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name: string }
  ) {
    const userId = this.getUserId(req);
    return this.assetsService.renameGroup(userId, id, body.name);
  }

  @Delete('groups/:id')
  async deleteGroup(@Req() req: Request, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.assetsService.deleteGroup(userId, id);
  }

  // ---- Asset Endpoints ----

  @Get()
  async getAssets(
    @Req() req: Request,
    @Query('groupId') groupId?: string,
    @Query('type') type?: string
  ) {
    const userId = this.getUserId(req);
    return this.assetsService.getAssets(userId, groupId, type);
  }

  @Post()
  async addAsset(
    @Req() req: Request,
    @Body() body: {
      name: string;
      type: string;
      url: string;
      thumbnailUrl?: string;
      groupId?: string;
    }
  ) {
    const userId = this.getUserId(req);
    return this.assetsService.addAsset(userId, body);
  }

  @Patch(':id/group')
  async updateAssetGroup(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { groupId: string | null }
  ) {
    const userId = this.getUserId(req);
    return this.assetsService.updateAssetGroup(userId, id, body.groupId);
  }

  @Delete(':id')
  async deleteAsset(@Req() req: Request, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.assetsService.deleteAsset(userId, id);
  }

  @Post('reorder')
  async reorderAssets(@Req() req: Request, @Body() body: { assetIds: string[] }) {
    const userId = this.getUserId(req);
    return this.assetsService.reorderAssets(userId, body.assetIds);
  }
}
