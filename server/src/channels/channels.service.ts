import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { join } from "path";

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
export class ChannelsService {
  private DATA_DIR = join(process.cwd(), "data");
  private FILE_PATH = join(this.DATA_DIR, "channels.json");

  private async ensureFileExists(): Promise<void> {
    const file = Bun.file(this.FILE_PATH);
    const exists = await file.exists();
    if (!exists) {
      // Create data directory if it doesn't exist
      const dirFile = Bun.file(this.DATA_DIR);
      // Bun.write will create parent directories automatically
      await Bun.write(this.FILE_PATH, JSON.stringify([], null, 2));
    }
  }

  async getAll(): Promise<Channel[]> {
    await this.ensureFileExists();
    try {
      const content = await Bun.file(this.FILE_PATH).text();
      return JSON.parse(content || "[]");
    } catch (err) {
      console.error("Failed to read channels.json:", err);
      return [];
    }
  }

  private async save(channels: Channel[]): Promise<void> {
    await this.ensureFileExists();
    await Bun.write(this.FILE_PATH, JSON.stringify(channels, null, 2));
  }

  async create(data: Omit<Channel, "id" | "createdAt">): Promise<Channel> {
    const channels = await this.getAll();
    const newChannel: Channel = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    channels.push(newChannel);
    await this.save(channels);
    return newChannel;
  }

  async update(id: string, updates: Partial<Channel>): Promise<Channel> {
    const channels = await this.getAll();
    const index = channels.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new HttpException("Channel not found", HttpStatus.NOT_FOUND);
    }
    // If apiKey is not provided or empty, preserve the existing key
    const safeUpdates = { ...updates };
    if (!safeUpdates.apiKey) {
      delete safeUpdates.apiKey;
    }
    const updatedChannel = {
      ...channels[index]!,
      ...safeUpdates,
      id, // ensure ID cannot be changed
      createdAt: channels[index]!.createdAt, // ensure createdAt cannot be changed
    };
    channels[index] = updatedChannel;
    await this.save(channels);
    return updatedChannel;
  }

  async delete(id: string): Promise<void> {
    const channels = await this.getAll();
    const filtered = channels.filter((c) => c.id !== id);
    if (filtered.length === channels.length) {
      throw new HttpException("Channel not found", HttpStatus.NOT_FOUND);
    }
    await this.save(filtered);
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
      
      // Ping /models to check if key is valid and endpoint is responsive
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
        
        // Match channel type
        const typeMatch = c.type === "all" || c.type === purpose;
        if (!typeMatch) return false;

        // Match model list wildcard or exact match
        const modelMatch =
          c.models.includes("*") ||
          c.models.some((m) => m.toLowerCase() === modelId.toLowerCase());
        
        return modelMatch;
      })
      .sort((a, b) => b.weight - a.weight); // sort highest weight first
  }
}
