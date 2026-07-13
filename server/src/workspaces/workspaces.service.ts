import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { join } from "path";
import { DatabaseService } from "../database/database.service";

export interface WorkspaceMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class WorkspacesService implements OnModuleInit {
  private DATA_DIR = join(process.cwd(), "data");

  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.db;
  }

  async onModuleInit() {
    // Check and run legacy JSON data migration
    await this.migrateLegacyData();
  }

  private async migrateLegacyData(): Promise<void> {
    const { existsSync, renameSync } = require("fs");
    const workspacesJsonPath = join(this.DATA_DIR, "workspaces.json");

    if (existsSync(workspacesJsonPath)) {
      try {
        const { readFile } = require("fs/promises");
        const content = await readFile(workspacesJsonPath, "utf-8");
        const list = JSON.parse(content || "[]");

        if (Array.isArray(list)) {
          const insertStmt = this.db.prepare(`
            INSERT OR IGNORE INTO workspaces (id, name, canvasData, createdAt, updatedAt)
            VALUES ($id, $name, $canvasData, $createdAt, $updatedAt)
          `);

          // Execute as a single transaction for efficiency and safety
          const transaction = this.db.transaction((workspacesList: WorkspaceMetadata[]) => {
            for (const ws of workspacesList) {
              const canvasPath = join(this.DATA_DIR, `canvas_${ws.id}.json`);
              let canvasData = "[]";
              if (existsSync(canvasPath)) {
                try {
                  const canvasContent = require("fs").readFileSync(canvasPath, "utf-8");
                  canvasData = JSON.stringify(JSON.parse(canvasContent || "[]"));
                } catch (err) {
                  console.error(`Failed to read legacy canvas for workspace ${ws.id}:`, err);
                }
              }

              insertStmt.run({
                $id: ws.id,
                $name: ws.name,
                $canvasData: canvasData,
                $createdAt: ws.createdAt,
                $updatedAt: ws.updatedAt
              });
            }
          });

          transaction(list);
          console.log(`Successfully migrated ${list.length} workspaces from JSON files to SQLite database.`);
        }

        // Backup and rename legacy workspaces JSON file
        renameSync(workspacesJsonPath, `${workspacesJsonPath}.bak`);

        // Backup and rename legacy canvas JSON files
        for (const ws of list) {
          const canvasPath = join(this.DATA_DIR, `canvas_${ws.id}.json`);
          if (existsSync(canvasPath)) {
            try {
              renameSync(canvasPath, `${canvasPath}.bak`);
            } catch (err) {
              console.warn(`Failed to rename legacy canvas file ${canvasPath}:`, err);
            }
          }
        }
      } catch (err) {
        console.error("Error migrating legacy workspaces JSON data:", err);
      }
    }
  }

  async getAll(userId?: string): Promise<WorkspaceMetadata[]> {
    try {
      if (!userId) {
        return [];
      }
      const query = this.db.query(`
        SELECT id, name, createdAt, updatedAt FROM workspaces 
        WHERE userId = $userId
        ORDER BY updatedAt DESC
      `);
      return query.all({ $userId: userId }) as WorkspaceMetadata[];
    } catch (err) {
      console.error("Failed to query workspaces from database:", err);
      return [];
    }
  }

  async getCanvas(id: string, userId?: string): Promise<any[]> {
    try {
      if (!userId) {
        throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
      }
      const query = this.db.query(`
        SELECT canvasData FROM workspaces WHERE id = $id AND userId = $userId
      `);
      const row = query.get({ $id: id, $userId: userId }) as { canvasData: string } | null;
      if (!row) {
        throw new HttpException("Workspace not found", HttpStatus.NOT_FOUND);
      }
      return JSON.parse(row.canvasData);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      console.error(`Failed to read canvas from database for workspace ${id}:`, err);
      throw new HttpException("Failed to read canvas", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async updateCanvas(id: string, canvasData: any[], userId?: string): Promise<void> {
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    if (!Array.isArray(canvasData)) {
      throw new HttpException("Canvas data must be an array", HttpStatus.BAD_REQUEST);
    }
    try {
      const now = new Date().toISOString();
      const nextCanvasData = JSON.stringify(canvasData);
      const transaction = this.db.transaction(() => {
        const current = this.db.query(`
          SELECT canvasData FROM workspaces WHERE id = $id AND userId = $userId
        `).get({ $id: id, $userId: userId }) as { canvasData: string } | null;
        if (!current) {
          throw new HttpException("Workspace not found", HttpStatus.NOT_FOUND);
        }
        if (current.canvasData === nextCanvasData) return;

        this.db.query(`
          INSERT INTO workspace_canvas_revisions (workspaceId, canvasData, createdAt)
          VALUES ($workspaceId, $canvasData, $createdAt)
        `).run({
          $workspaceId: id,
          $canvasData: current.canvasData,
          $createdAt: now,
        });

        this.db.query(`
          UPDATE workspaces
          SET canvasData = $canvasData, updatedAt = $updatedAt
          WHERE id = $id AND userId = $userId
        `).run({
          $id: id,
          $userId: userId,
          $canvasData: nextCanvasData,
          $updatedAt: now,
        });

        this.db.query(`
          DELETE FROM workspace_canvas_revisions
          WHERE workspaceId = $workspaceId
            AND id NOT IN (
              SELECT id FROM workspace_canvas_revisions
              WHERE workspaceId = $workspaceId
              ORDER BY id DESC
              LIMIT 50
            )
        `).run({ $workspaceId: id });
      });
      transaction();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      console.error(`Failed to update canvas in database for workspace ${id}:`, err);
      throw new HttpException("Failed to update canvas", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async create(name: string, userId?: string): Promise<WorkspaceMetadata> {
    if (!userId) {
      throw new HttpException("请先登录后再创建工作区", HttpStatus.UNAUTHORIZED);
    }

    try {
      const id = crypto.randomUUID().replace(/-/g, "");
      const now = new Date().toISOString();
      const newWs: WorkspaceMetadata = {
        id,
        name,
        createdAt: now,
        updatedAt: now,
      };

      const stmt = this.db.prepare(`
        INSERT INTO workspaces (id, name, canvasData, createdAt, updatedAt, userId)
        VALUES ($id, $name, $canvasData, $createdAt, $updatedAt, $userId)
      `);
      stmt.run({
        $id: id,
        $name: name,
        $canvasData: "[]",
        $createdAt: now,
        $updatedAt: now,
        $userId: userId,
      });

      return newWs;
    } catch (err) {
      console.error("Failed to create workspace in database:", err);
      throw new HttpException("Failed to create workspace", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async updateMetadata(id: string, name: string, userId?: string): Promise<WorkspaceMetadata> {
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        UPDATE workspaces 
        SET name = $name, updatedAt = $updatedAt 
        WHERE id = $id AND userId = $userId
      `);
      const info = stmt.run({
        $id: id,
        $userId: userId,
        $name: name,
        $updatedAt: now
      });

      if (info.changes === 0) {
        throw new HttpException("Workspace not found", HttpStatus.NOT_FOUND);
      }

      const getStmt = this.db.query(`
        SELECT id, name, createdAt, updatedAt
        FROM workspaces WHERE id = $id AND userId = $userId
      `);
      return getStmt.get({ $id: id, $userId: userId }) as WorkspaceMetadata;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      console.error(`Failed to update workspace metadata in database for workspace ${id}:`, err);
      throw new HttpException("Failed to update workspace metadata", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async delete(id: string, userId?: string): Promise<void> {
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    try {
      const stmt = this.db.prepare(`
        DELETE FROM workspaces WHERE id = $id AND userId = $userId
      `);
      const info = stmt.run({ $id: id, $userId: userId });
      if (info.changes === 0) {
        throw new HttpException("Workspace not found", HttpStatus.NOT_FOUND);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      console.error(`Failed to delete workspace from database: ${id}`, err);
      throw new HttpException("Failed to delete workspace", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
