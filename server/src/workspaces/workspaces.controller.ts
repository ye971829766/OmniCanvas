import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, UseGuards, Req } from "@nestjs/common";
import { WorkspacesService } from "./workspaces.service";
import type { WorkspaceMetadata } from "./workspaces.service";
import { AuthGuard } from "../auth/auth.guard";

@Controller("workspaces")
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async getAll(@Req() req: any): Promise<WorkspaceMetadata[]> {
    const userId = req.user?.sub;
    return this.workspacesService.getAll(userId);
  }

  @Get(":id/canvas")
  async getCanvas(@Req() req: any, @Param("id") id: string): Promise<any[]> {
    return this.workspacesService.getCanvas(id, req.user?.sub);
  }

  @Put(":id/canvas")
  @HttpCode(HttpStatus.OK)
  async updateCanvas(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: any[],
  ): Promise<{ success: boolean }> {
    await this.workspacesService.updateCanvas(id, body, req.user?.sub);
    return { success: true };
  }

  @Post()
  async create(@Req() req: any, @Body("name") name: string): Promise<WorkspaceMetadata> {
    const userId = req.user?.sub;
    return this.workspacesService.create(name || "未命名工作区", userId);
  }

  @Put(":id")
  async updateMetadata(
    @Req() req: any,
    @Param("id") id: string,
    @Body("name") name: string,
  ): Promise<WorkspaceMetadata> {
    return this.workspacesService.updateMetadata(id, name, req.user?.sub);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: any, @Param("id") id: string): Promise<void> {
    return this.workspacesService.delete(id, req.user?.sub);
  }
}
