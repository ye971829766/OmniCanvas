import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { WorkspacesService } from "./workspaces.service";
import type { WorkspaceMetadata } from "./workspaces.service";

@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async getAll(): Promise<WorkspaceMetadata[]> {
    return this.workspacesService.getAll();
  }

  @Get(":id/canvas")
  async getCanvas(@Param("id") id: string): Promise<any[]> {
    return this.workspacesService.getCanvas(id);
  }

  @Put(":id/canvas")
  @HttpCode(HttpStatus.OK)
  async updateCanvas(
    @Param("id") id: string,
    @Body() body: any[],
  ): Promise<{ success: boolean }> {
    await this.workspacesService.updateCanvas(id, body);
    return { success: true };
  }

  @Post()
  async create(@Body("name") name: string): Promise<WorkspaceMetadata> {
    return this.workspacesService.create(name || "未命名工作区");
  }

  @Put(":id")
  async updateMetadata(
    @Param("id") id: string,
    @Body("name") name: string,
  ): Promise<WorkspaceMetadata> {
    return this.workspacesService.updateMetadata(id, name);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string): Promise<void> {
    return this.workspacesService.delete(id);
  }
}
