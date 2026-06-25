import { Injectable } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { Database } from "bun:sqlite";
import { join } from "path";

@Injectable()
export class DatabaseService implements OnModuleInit {
  private DATA_DIR = join(process.cwd(), "data");
  private DB_PATH = join(this.DATA_DIR, "database.db");
  private dbInstance!: Database;

  async onModuleInit() {
    const { mkdir } = require("fs/promises");
    await mkdir(this.DATA_DIR, { recursive: true });

    // Open/create SQLite database file
    this.dbInstance = new Database(this.DB_PATH);

    // 1. Create workspaces table
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        canvasData TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    // 2. Create channels table
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        baseUrl TEXT NOT NULL,
        apiKey TEXT NOT NULL,
        type TEXT NOT NULL,
        models TEXT NOT NULL,
        weight INTEGER NOT NULL,
        status INTEGER NOT NULL,
        notes TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    // 3. Create model_config table
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS model_config (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `);

    // 4. Create agent_sessions table to persist agent chat history
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        sessionId TEXT PRIMARY KEY,
        messages TEXT NOT NULL,
        brand TEXT,
        screenshot TEXT,
        lastExportedNodeImage TEXT,
        lastAccess INTEGER NOT NULL
      )
    `);

    // 5. Create generation_tasks table to persist generated image/video task states
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS generation_tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `);
  }

  get db(): Database {
    return this.dbInstance;
  }
}
