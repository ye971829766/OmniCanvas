import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { join } from "path";
import { DatabaseService } from "../database/database.service";

export interface Channel {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  type: "image" | "chat" | "video" | "all";
  models: string[]; // e.g. ["*"] or specific model names
  weight: number;
  status: boolean;
  notes?: string;
  createdAt: string;
}

@Injectable()
export class ChannelsService implements OnModuleInit {
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
    const channelsJsonPath = join(this.DATA_DIR, "channels.json");

    if (existsSync(channelsJsonPath)) {
      try {
        const { readFile } = require("fs/promises");
        const content = await readFile(channelsJsonPath, "utf-8");
        const list = JSON.parse(content || "[]");

        if (Array.isArray(list)) {
          const insertStmt = this.db.prepare(`
            INSERT OR IGNORE INTO channels (id, name, baseUrl, apiKey, type, models, weight, status, notes, createdAt)
            VALUES ($id, $name, $baseUrl, $apiKey, $type, $models, $weight, $status, $notes, $createdAt)
          `);

          const transaction = this.db.transaction((channelsList: Channel[]) => {
            for (const ch of channelsList) {
              insertStmt.run({
                $id: ch.id,
                $name: ch.name,
                $baseUrl: ch.baseUrl,
                $apiKey: ch.apiKey,
                $type: ch.type,
                $models: JSON.stringify(ch.models),
                $weight: ch.weight,
                $status: ch.status ? 1 : 0,
                $notes: ch.notes || null,
                $createdAt: ch.createdAt
              });
            }
          });

          transaction(list);
          console.log(`Successfully migrated ${list.length} channels from channels.json to SQLite database.`);
        }

        // Rename legacy file to .bak extension
        renameSync(channelsJsonPath, `${channelsJsonPath}.bak`);
      } catch (err) {
        console.error("Error migrating legacy channels JSON data:", err);
      }
    }
  }

  async getAll(): Promise<Channel[]> {
    try {
      const query = this.db.query("SELECT * FROM channels");
      const rows = query.all() as any[];
      return rows.map((r) => ({
        ...r,
        models: JSON.parse(r.models),
        status: r.status === 1,
        notes: r.notes || undefined
      }));
    } catch (err) {
      console.error("Failed to query channels from database:", err);
      return [];
    }
  }

  async create(data: Omit<Channel, "id" | "createdAt">): Promise<Channel> {
    try {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO channels (id, name, baseUrl, apiKey, type, models, weight, status, notes, createdAt)
        VALUES ($id, $name, $baseUrl, $apiKey, $type, $models, $weight, $status, $notes, $createdAt)
      `);
      stmt.run({
        $id: id,
        $name: data.name,
        $baseUrl: data.baseUrl,
        $apiKey: data.apiKey,
        $type: data.type,
        $models: JSON.stringify(data.models),
        $weight: data.weight,
        $status: data.status ? 1 : 0,
        $notes: data.notes || null,
        $createdAt: createdAt
      });

      return {
        ...data,
        id,
        createdAt
      };
    } catch (err) {
      console.error("Failed to create channel in database:", err);
      throw new HttpException("Failed to create channel", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async update(id: string, updates: Partial<Channel>): Promise<Channel> {
    try {
      const query = this.db.query("SELECT * FROM channels WHERE id = $id");
      const channel = query.get({ $id: id }) as any;
      if (!channel) {
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND);
      }

      const safeUpdates = { ...updates };
      if (!safeUpdates.apiKey) {
        delete safeUpdates.apiKey;
      }

      const updatedModels = safeUpdates.models !== undefined 
        ? JSON.stringify(safeUpdates.models) 
        : channel.models;

      const updatedStatus = safeUpdates.status !== undefined
        ? (safeUpdates.status ? 1 : 0)
        : channel.status;

      const stmt = this.db.prepare(`
        UPDATE channels 
        SET name = $name, baseUrl = $baseUrl, apiKey = $apiKey, type = $type, 
            models = $models, weight = $weight, status = $status, notes = $notes
        WHERE id = $id
      `);

      stmt.run({
        $id: id,
        $name: safeUpdates.name !== undefined ? safeUpdates.name : channel.name,
        $baseUrl: safeUpdates.baseUrl !== undefined ? safeUpdates.baseUrl : channel.baseUrl,
        $apiKey: safeUpdates.apiKey !== undefined ? safeUpdates.apiKey : channel.apiKey,
        $type: safeUpdates.type !== undefined ? safeUpdates.type : channel.type,
        $models: updatedModels,
        $weight: safeUpdates.weight !== undefined ? safeUpdates.weight : channel.weight,
        $status: updatedStatus,
        $notes: safeUpdates.notes !== undefined ? (safeUpdates.notes || null) : channel.notes
      });

      const updatedRow = this.db.query("SELECT * FROM channels WHERE id = $id").get({ $id: id }) as any;
      return {
        ...updatedRow,
        models: JSON.parse(updatedRow.models),
        status: updatedRow.status === 1,
        notes: updatedRow.notes || undefined
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      console.error(`Failed to update channel ${id} in database:`, err);
      throw new HttpException("Failed to update channel", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const stmt = this.db.prepare("DELETE FROM channels WHERE id = $id");
      const info = stmt.run({ $id: id });
      if (info.changes === 0) {
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      console.error(`Failed to delete channel ${id} from database:`, err);
      throw new HttpException("Failed to delete channel", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async testConnection(id: string): Promise<{ success: boolean; latency: number; error?: string }> {
    const channels = await this.getAll();
    const channel = channels.find((c) => c.id === id);
    if (!channel) {
      throw new HttpException("Channel not found", HttpStatus.NOT_FOUND);
    }

    const start = Date.now();
    try {
      const normalizedBaseUrl = channel.baseUrl.replace(/\/+$/, "");
      
      const response = await fetch(`${normalizedBaseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${channel.apiKey}`,
        },
      } as any);

      const latency = Date.now() - start;

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        if (response.status === 404) {
          errMessage += " (Endpoint /models not found. Note: Some proxy channels do not support /models)";
        } else {
          try {
            const body: any = await response.json();
            if (body?.error?.message) errMessage += `: ${body.error.message}`;
            else if (body?.message) errMessage += `: ${body.message}`;
          } catch {
            // ignore parsing fail
          }
        }
        return { success: false, latency, error: errMessage };
      }

      return { success: true, latency };
    } catch (err: any) {
      return {
        success: false,
        latency: Date.now() - start,
        error: err.message || "Connection timed out or network error",
      };
    }
  }

  async discoverModels(id: string): Promise<{ success: boolean; models: string[]; error?: string }> {
    const channels = await this.getAll();
    const channel = channels.find((c) => c.id === id);
    if (!channel) {
      throw new HttpException("Channel not found", HttpStatus.NOT_FOUND);
    }
    return this.discoverModelsWithCredentials(channel.baseUrl, channel.apiKey);
  }

  async discoverModelsWithCredentials(
    baseUrl: string,
    apiKey: string,
  ): Promise<{ success: boolean; models: string[]; error?: string }> {
    try {
      const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
      const response = await fetch(`${normalizedBaseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      } as any);

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const body: any = await response.json();
          if (body?.error?.message) errMessage += `: ${body.error.message}`;
          else if (body?.message) errMessage += `: ${body.message}`;
        } catch {
          // ignore parsing fail
        }
        return { success: false, models: [], error: errMessage };
      }

      const body: any = await response.json();
      let modelList: string[] = [];
      if (body && Array.isArray(body.data)) {
        modelList = body.data.map((m: any) => m.id).filter(Boolean);
      } else if (body && Array.isArray(body)) {
        modelList = body.map((m: any) => typeof m === "string" ? m : m.id).filter(Boolean);
      }
      return { success: true, models: modelList };
    } catch (err: any) {
      return {
        success: false,
        models: [],
        error: err.message || "Network error or connection timed out",
      };
    }
  }

  async getActiveChannelsForModel(
    purpose: "image" | "chat" | "video",
    modelId: string,
  ): Promise<Channel[]> {
    const channels = await this.getAll();
    return channels
      .filter((c) => {
        if (!c.status) return false;
        
        const typeMatch = c.type === "all" || c.type === purpose;
        if (!typeMatch) return false;

        const modelMatch =
          c.models.includes("*") ||
          c.models.some((m) => m.toLowerCase() === modelId.toLowerCase());
        
        return modelMatch;
      })
      .sort((a, b) => b.weight - a.weight);
  }
}
