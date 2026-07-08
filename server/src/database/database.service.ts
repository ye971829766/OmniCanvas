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
        updatedAt TEXT NOT NULL,
        userId TEXT
      )
    `);

    // Ensure userId column exists if workspaces table was created previously without it
    try {
      const columns = this.dbInstance.query("PRAGMA table_info(workspaces)").all() as any[];
      const hasUserId = columns.some((col) => col.name === "userId");
      if (!hasUserId) {
        this.dbInstance.run("ALTER TABLE workspaces ADD COLUMN userId TEXT");
      }
    } catch (err) {
      console.warn("Failed to check or alter workspaces table for userId:", err);
    }

    // Cleanup: Automatically delete all workspaces that are not bound to a user
    try {
      this.dbInstance.run(`
        DELETE FROM workspaces 
        WHERE userId IS NULL OR TRIM(userId) = '' OR userId = 'guest'
      `);
    } catch (err) {
      console.warn("Failed to delete unassigned workspaces:", err);
    }

    // 2. Create users table
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        passwordHash TEXT NOT NULL,
        avatarUrl TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    // Migration: Ensure email, nickname, avatarUrl, role columns exist in users table
    try {
      const userColumns = this.dbInstance.query("PRAGMA table_info(users)").all() as any[];
      const colNames = userColumns.map((col) => col.name);
      if (!colNames.includes("email")) {
        this.dbInstance.run("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''");
      }
      if (!colNames.includes("nickname")) {
        this.dbInstance.run("ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
      }
      if (!colNames.includes("avatarUrl")) {
        this.dbInstance.run("ALTER TABLE users ADD COLUMN avatarUrl TEXT");
      }
      if (!colNames.includes("role")) {
        this.dbInstance.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
      }
    } catch (err) {
      console.warn("Failed to check or alter users table columns:", err);
    }

    // 3. Create channels table
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

    // 4. Create model_config table
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS model_config (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `);

    // 5. Create agent_sessions table to persist agent chat history
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

    // 6. Create generation_tasks table to persist generated image/video task states
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS generation_tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `);

    // 7. Create token_logs table to track token consumption
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS token_logs (
        id TEXT PRIMARY KEY,
        userId TEXT,
        username TEXT,
        model TEXT,
        promptTokens INTEGER DEFAULT 0,
        completionTokens INTEGER DEFAULT 0,
        totalTokens INTEGER DEFAULT 0,
        type TEXT DEFAULT 'chat',
        createdAt TEXT NOT NULL
      )
    `);

    // 8. Create asset_groups table
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS asset_groups (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `);

    // 9. Create assets table
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        thumbnailUrl TEXT,
        groupId TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      )
    `);
  }

  get db(): Database {
    return this.dbInstance;
  }
}
