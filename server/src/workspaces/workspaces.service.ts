import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { join } from "path";

export interface WorkspaceMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class WorkspacesService {
  private DATA_DIR = join(process.cwd(), "data");
  private LIST_PATH = join(this.DATA_DIR, "workspaces.json");

  private async ensureDataExists(): Promise<void> {
    const listFile = Bun.file(this.LIST_PATH);
    let exists = await listFile.exists();
    let resetSeeding = false;

    if (exists) {
      try {
        const content = await listFile.text();
        const list = JSON.parse(content);
        if (Array.isArray(list) && list.some((ws: any) => ws.id === "1")) {
          resetSeeding = true;
        }
      } catch (err) {
        resetSeeding = true;
      }
    }

    if (!exists || resetSeeding) {
      // If we are resetting, try to clean up old legacy files
      if (resetSeeding) {
        const { unlink } = require("fs/promises");
        for (const id of ["1", "2", "3", "4", "5"]) {
          const path = join(this.DATA_DIR, `canvas_${id}.json`);
          try {
            await unlink(path);
          } catch {}
        }
      }

      // Seed default workspaces with 32-character hex UUIDs
      const defaultWorkspaces: WorkspaceMetadata[] = [];

      const { mkdir } = require("fs/promises");
      await mkdir(this.DATA_DIR, { recursive: true });
      await Bun.write(
        this.LIST_PATH,
        JSON.stringify(defaultWorkspaces, null, 2),
      );

      // Seed canvas files for default workspaces with a default ImageGen node
      for (const ws of defaultWorkspaces) {
        const canvasPath = join(this.DATA_DIR, `canvas_${ws.id}.json`);
        const defaultCanvas = [
          {
            tag: "ImageGen",
            x: 300,
            y: 200,
            width: 400,
            height: 300,
            editable: true,
          },
        ];
        await Bun.write(canvasPath, JSON.stringify(defaultCanvas, null, 2));
      }
    }
  }

  async getAll(): Promise<WorkspaceMetadata[]> {
    await this.ensureDataExists();
    try {
      const content = await Bun.file(this.LIST_PATH).text();
      // 按时间倒序排序
      const list = JSON.parse(content || "[]");
      list.sort((a: WorkspaceMetadata, b: WorkspaceMetadata) => {
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
      return list;
    } catch (err) {
      console.error("Failed to read workspaces.json:", err);
      return [];
    }
  }

  private async saveList(list: WorkspaceMetadata[]): Promise<void> {
    await this.ensureDataExists();
    await Bun.write(this.LIST_PATH, JSON.stringify(list, null, 2));
  }

  async getCanvas(id: string): Promise<any[]> {
    await this.ensureDataExists();
    const canvasPath = join(this.DATA_DIR, `canvas_${id}.json`);
    const file = Bun.file(canvasPath);
    const exists = await file.exists();
    if (!exists) {
      return [];
    }
    try {
      const content = await file.text();
      return JSON.parse(content || "[]");
    } catch (err) {
      console.error(`Failed to read canvas file for workspace ${id}:`, err);
      return [];
    }
  }

  async updateCanvas(id: string, canvasData: any[]): Promise<void> {
    await this.ensureDataExists();
    const canvasPath = join(this.DATA_DIR, `canvas_${id}.json`);
    await Bun.write(canvasPath, JSON.stringify(canvasData, null, 2));

    // Update updatedAt timestamp
    const list = await this.getAll();
    const index = list.findIndex((ws) => ws.id === id);
    if (index !== -1) {
      list[index]!.updatedAt = new Date().toISOString();
      await this.saveList(list);
    }
  }

  async create(name: string): Promise<WorkspaceMetadata> {
    const list = await this.getAll();
    const id = crypto.randomUUID().replace(/-/g, "");
    const newWs: WorkspaceMetadata = {
      id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.push(newWs);
    await this.saveList(list);

    // Create empty canvas file
    const canvasPath = join(this.DATA_DIR, `canvas_${id}.json`);
    await Bun.write(canvasPath, JSON.stringify([], null, 2));

    return newWs;
  }

  async updateMetadata(id: string, name: string): Promise<WorkspaceMetadata> {
    const list = await this.getAll();
    const index = list.findIndex((ws) => ws.id === id);
    if (index === -1) {
      throw new HttpException("Workspace not found", HttpStatus.NOT_FOUND);
    }
    list[index]!.name = name;
    list[index]!.updatedAt = new Date().toISOString();
    await this.saveList(list);
    return list[index]!;
  }

  async delete(id: string): Promise<void> {
    const list = await this.getAll();
    const filtered = list.filter((ws) => ws.id !== id);
    if (filtered.length === list.length) {
      throw new HttpException("Workspace not found", HttpStatus.NOT_FOUND);
    }
    await this.saveList(filtered);

    // Delete canvas file
    const canvasPath = join(this.DATA_DIR, `canvas_${id}.json`);
    const file = Bun.file(canvasPath);
    if (await file.exists()) {
      const { unlink } = require("fs/promises");
      try {
        await unlink(canvasPath);
      } catch (err) {
        console.warn(`Failed to delete canvas file ${canvasPath}:`, err);
      }
    }
  }
}
