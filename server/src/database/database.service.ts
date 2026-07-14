import { Injectable } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { Database } from "bun:sqlite";
import { join } from "path";

@Injectable()
export class DatabaseService implements OnModuleInit {
  private DATA_DIR = join(process.cwd(), "data");
  private DB_PATH = process.env.DATABASE_PATH || join(this.DATA_DIR, "database.db");
  private dbInstance!: Database;

  async onModuleInit() {
    const { mkdir } = require("fs/promises");
    await mkdir(this.DATA_DIR, { recursive: true });

    // Open/create SQLite database file
    this.dbInstance = new Database(this.DB_PATH);
    // Billing writes must be durable, wait briefly for concurrent writers, and
    // actually enforce the foreign keys declared below.
    this.dbInstance.run("PRAGMA journal_mode = WAL");
    this.dbInstance.run("PRAGMA foreign_keys = ON");
    this.dbInstance.run("PRAGMA busy_timeout = 5000");

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

    // Keep a bounded recovery history before replacing a workspace canvas.
    // This is intentionally separate from undo/redo so client lifecycle bugs
    // cannot make the last good server copy unrecoverable.
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS workspace_canvas_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspaceId TEXT NOT NULL,
        canvasData TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `);
    this.dbInstance.run(`
      CREATE INDEX IF NOT EXISTS idx_workspace_canvas_revisions_workspace_created
      ON workspace_canvas_revisions(workspaceId, createdAt DESC)
    `);

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
        assets TEXT,
        plan TEXT,
        screenshot TEXT,
        lastExportedNodeImage TEXT,
        lastAccess INTEGER NOT NULL
      )
    `);

    try {
      const agentColumns = this.dbInstance.query("PRAGMA table_info(agent_sessions)").all() as any[];
      if (!agentColumns.some((column) => column.name === "assets")) {
        this.dbInstance.run("ALTER TABLE agent_sessions ADD COLUMN assets TEXT");
      }
      if (!agentColumns.some((column) => column.name === "plan")) {
        this.dbInstance.run("ALTER TABLE agent_sessions ADD COLUMN plan TEXT");
      }
      if (!agentColumns.some((column) => column.name === "userId")) {
        this.dbInstance.run("ALTER TABLE agent_sessions ADD COLUMN userId TEXT");
      }
    } catch (err) {
      console.warn("Failed to check or alter agent_sessions assets column:", err);
    }

    // 6. Create generation_tasks table to persist generated image/video task states
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS generation_tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER,
        userId TEXT,
        billingOperationId TEXT
      )
    `);

    try {
      const taskColumns = this.dbInstance.query("PRAGMA table_info(generation_tasks)").all() as any[];
      const taskColumnNames = new Set(taskColumns.map((column) => column.name));
      if (!taskColumnNames.has("updatedAt")) {
        this.dbInstance.run("ALTER TABLE generation_tasks ADD COLUMN updatedAt INTEGER");
      }
      if (!taskColumnNames.has("userId")) {
        this.dbInstance.run("ALTER TABLE generation_tasks ADD COLUMN userId TEXT");
      }
      if (!taskColumnNames.has("billingOperationId")) {
        this.dbInstance.run("ALTER TABLE generation_tasks ADD COLUMN billingOperationId TEXT");
      }
    } catch (err) {
      console.warn("Failed to migrate generation task ownership columns:", err);
    }

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

    // 10. Versioned pricing configuration. Amounts use integer microcredits:
    // 1 displayed credit = 1,000,000 microcredits.
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_price_versions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'retired')),
        createdAt TEXT NOT NULL,
        publishedAt TEXT
      )
    `);
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_price_rules (
        id TEXT PRIMARY KEY,
        versionId TEXT NOT NULL,
        operation TEXT NOT NULL,
        model TEXT,
        baseMicros INTEGER NOT NULL DEFAULT 0 CHECK(baseMicros >= 0),
        inputMicrosPerMillionTokens INTEGER NOT NULL DEFAULT 0 CHECK(inputMicrosPerMillionTokens >= 0),
        outputMicrosPerMillionTokens INTEGER NOT NULL DEFAULT 0 CHECK(outputMicrosPerMillionTokens >= 0),
        config TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (versionId) REFERENCES billing_price_versions(id),
        UNIQUE(versionId, operation, model)
      )
    `);

    // 11. Account snapshot + expirable credit lots. The account is a cached
    // projection updated in the same transaction as the immutable ledger.
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_accounts (
        userId TEXT PRIMARY KEY,
        availableMicros INTEGER NOT NULL DEFAULT 0 CHECK(availableMicros >= 0),
        reservedMicros INTEGER NOT NULL DEFAULT 0 CHECK(reservedMicros >= 0),
        lifetimeGrantedMicros INTEGER NOT NULL DEFAULT 0 CHECK(lifetimeGrantedMicros >= 0),
        lifetimeSpentMicros INTEGER NOT NULL DEFAULT 0 CHECK(lifetimeSpentMicros >= 0),
        version INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_credit_grants (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        originalMicros INTEGER NOT NULL CHECK(originalMicros > 0),
        remainingMicros INTEGER NOT NULL CHECK(remainingMicros >= 0),
        reservedMicros INTEGER NOT NULL DEFAULT 0 CHECK(reservedMicros >= 0),
        expiresAt TEXT,
        metadata TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id),
        UNIQUE(userId, sourceType, sourceId),
        CHECK(reservedMicros <= remainingMicros)
      )
    `);

    // 12. One business operation owns a reservation and is correlated with an
    // async task. Idempotency is scoped to a user and guarded by requestHash.
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_operations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        idempotencyKey TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('reserved', 'captured', 'released')),
        quotedMicros INTEGER NOT NULL CHECK(quotedMicros >= 0),
        finalMicros INTEGER,
        priceVersionId TEXT NOT NULL,
        requestHash TEXT NOT NULL,
        taskId TEXT,
        metadata TEXT,
        error TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (priceVersionId) REFERENCES billing_price_versions(id),
        UNIQUE(userId, idempotencyKey),
        UNIQUE(taskId)
      )
    `);
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_allocations (
        id TEXT PRIMARY KEY,
        operationId TEXT NOT NULL,
        grantId TEXT NOT NULL,
        reservedMicros INTEGER NOT NULL CHECK(reservedMicros > 0),
        capturedMicros INTEGER NOT NULL DEFAULT 0 CHECK(capturedMicros >= 0),
        releasedMicros INTEGER NOT NULL DEFAULT 0 CHECK(releasedMicros >= 0),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (operationId) REFERENCES billing_operations(id),
        FOREIGN KEY (grantId) REFERENCES billing_credit_grants(id),
        UNIQUE(operationId, grantId),
        CHECK(capturedMicros + releasedMicros <= reservedMicros)
      )
    `);

    // 13. Immutable double-delta audit trail. Rows are never updated/deleted.
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_ledger_entries (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        operationId TEXT,
        grantId TEXT,
        type TEXT NOT NULL,
        availableDeltaMicros INTEGER NOT NULL DEFAULT 0,
        reservedDeltaMicros INTEGER NOT NULL DEFAULT 0,
        consumedDeltaMicros INTEGER NOT NULL DEFAULT 0,
        availableAfterMicros INTEGER NOT NULL CHECK(availableAfterMicros >= 0),
        reservedAfterMicros INTEGER NOT NULL CHECK(reservedAfterMicros >= 0),
        idempotencyKey TEXT NOT NULL UNIQUE,
        metadata TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (operationId) REFERENCES billing_operations(id),
        FOREIGN KEY (grantId) REFERENCES billing_credit_grants(id)
      )
    `);
    this.dbInstance.run(`
      CREATE TRIGGER IF NOT EXISTS billing_ledger_no_update
      BEFORE UPDATE ON billing_ledger_entries
      BEGIN
        SELECT RAISE(ABORT, 'billing ledger entries are immutable');
      END
    `);
    this.dbInstance.run(`
      CREATE TRIGGER IF NOT EXISTS billing_ledger_no_delete
      BEFORE DELETE ON billing_ledger_entries
      BEGIN
        SELECT RAISE(ABORT, 'billing ledger entries are immutable');
      END
    `);

    // 14. Sellable catalog. Orders always snapshot a server-side product so
    // clients can never choose their own price or credit amount.
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL CHECK(kind IN ('credit_pack', 'subscription')),
        creditsMicros INTEGER NOT NULL CHECK(creditsMicros > 0),
        amountMinor INTEGER NOT NULL CHECK(amountMinor >= 0),
        currency TEXT NOT NULL,
        badge TEXT,
        features TEXT,
        status TEXT NOT NULL CHECK(status IN ('active', 'archived')),
        sortOrder INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    // 15. Payment boundary. Provider adapters are intentionally not bundled:
    // verified webhooks will persist their event and grant credits in one DB
    // transaction once merchant credentials are configured.
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_orders (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('credit_pack', 'subscription')),
        sku TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        amountMinor INTEGER NOT NULL CHECK(amountMinor >= 0),
        currency TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'paid', 'closed', 'refunding', 'refunded')),
        idempotencyKey TEXT,
        provider TEXT,
        providerPaymentId TEXT,
        createdAt TEXT NOT NULL,
        paidAt TEXT,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id),
        UNIQUE(provider, providerPaymentId)
      )
    `);
    try {
      const orderColumns = this.dbInstance.query("PRAGMA table_info(billing_orders)").all() as any[];
      if (!orderColumns.some((column) => column.name === "idempotencyKey")) {
        this.dbInstance.run("ALTER TABLE billing_orders ADD COLUMN idempotencyKey TEXT");
      }
    } catch (err) {
      console.warn("Failed to migrate billing order idempotency column:", err);
    }
    this.dbInstance.run(`
      CREATE TABLE IF NOT EXISTS billing_payment_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        providerEventId TEXT NOT NULL,
        orderId TEXT,
        payloadHash TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('received', 'processed', 'rejected')),
        error TEXT,
        receivedAt TEXT NOT NULL,
        processedAt TEXT,
        FOREIGN KEY (orderId) REFERENCES billing_orders(id),
        UNIQUE(provider, providerEventId)
      )
    `);

    this.dbInstance.run("CREATE INDEX IF NOT EXISTS idx_billing_grants_spend ON billing_credit_grants(userId, expiresAt, createdAt)");
    this.dbInstance.run("CREATE INDEX IF NOT EXISTS idx_billing_operations_user ON billing_operations(userId, createdAt DESC)");
    this.dbInstance.run("CREATE INDEX IF NOT EXISTS idx_billing_operations_status ON billing_operations(status, updatedAt)");
    this.dbInstance.run("CREATE INDEX IF NOT EXISTS idx_billing_ledger_user ON billing_ledger_entries(userId, createdAt DESC)");
    this.dbInstance.run("CREATE INDEX IF NOT EXISTS idx_billing_orders_user ON billing_orders(userId, createdAt DESC)");
    this.dbInstance.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_orders_idempotency ON billing_orders(userId, idempotencyKey) WHERE idempotencyKey IS NOT NULL");
    this.dbInstance.run("CREATE INDEX IF NOT EXISTS idx_generation_tasks_user ON generation_tasks(userId, createdAt DESC)");

    this.seedBillingPriceRules();
    this.seedBillingProducts();
  }

  private seedBillingPriceRules(): void {
    const now = new Date().toISOString();
    const versionId = "credits-v1";
    this.dbInstance.query(`
      INSERT OR IGNORE INTO billing_price_versions (id, status, createdAt, publishedAt)
      VALUES ($id, 'active', $now, $now)
    `).run({ $id: versionId, $now: now });

    // Video unit economics (target ~50–70% AI gross at pack ~¥0.03/credit):
    // upstream ≈ ¥0.7–1.5/s → charge ~100 credits/s (≈ ¥2.0–3.0/s depending on pack).
    const rules = [
      { id: "v1-llm", operation: "llm_chat", base: 0, input: 1_000_000_000, output: 1_000_000_000, config: {} },
      { id: "v1-image", operation: "image_generation", base: 10_000_000, input: 0, output: 0, config: { qualityMultipliers: { high: 2, hd: 2 }, sizeMultipliers: { "2048x2048": 2, "4096x4096": 4, "4k": 4 } } },
      { id: "v1-edit", operation: "image_edit", base: 10_000_000, input: 0, output: 0, config: { qualityMultipliers: { high: 2, hd: 2 } } },
      { id: "v1-video", operation: "video_generation", base: 500_000_000, input: 0, output: 0, config: { includedSeconds: 5, additionalMicrosPerSecond: 100_000_000 } },
      { id: "v1-remove-bg", operation: "remove_background", base: 5_000_000, input: 0, output: 0, config: {} },
      { id: "v1-upscale", operation: "upscale_image", base: 8_000_000, input: 0, output: 0, config: { scaleMultipliers: { "2": 1, "4": 1.5 } } },
      { id: "v1-inpaint", operation: "inpaint_image", base: 10_000_000, input: 0, output: 0, config: {} },
    ];
    const insert = this.dbInstance.query(`
      INSERT OR IGNORE INTO billing_price_rules
        (id, versionId, operation, model, baseMicros, inputMicrosPerMillionTokens, outputMicrosPerMillionTokens, config, priority)
      VALUES ($id, $versionId, $operation, NULL, $base, $input, $output, $config, 0)
    `);
    for (const rule of rules) {
      insert.run({
        $id: rule.id,
        $versionId: versionId,
        $operation: rule.operation,
        $base: rule.base,
        $input: rule.input,
        $output: rule.output,
        $config: JSON.stringify(rule.config),
      });
    }

    // One-time migration from the old loss-making video default (50 credits / 5s).
    // Do not overwrite rules that admins have already retuned in the console.
    const videoRule = rules.find((rule) => rule.id === "v1-video");
    if (videoRule) {
      this.dbInstance.query(`
        UPDATE billing_price_rules
        SET baseMicros = $base,
            inputMicrosPerMillionTokens = $input,
            outputMicrosPerMillionTokens = $output,
            config = $config
        WHERE id = $id
          AND versionId = $versionId
          AND model IS NULL
          AND baseMicros = 50000000
      `).run({
        $id: videoRule.id,
        $versionId: versionId,
        $base: videoRule.base,
        $input: videoRule.input,
        $output: videoRule.output,
        $config: JSON.stringify(videoRule.config),
      });
    }
  }

  private seedBillingProducts(): void {
    const now = new Date().toISOString();
    const products = [
      { id: "pack-500", sku: "credits_500", name: "轻量包", description: "适合体验与偶尔创作", kind: "credit_pack", credits: 500, amount: 1900, badge: null, features: ["500 积分", "长期有效"] },
      { id: "pack-2000", sku: "credits_2000", name: "创作包", description: "适合稳定的个人创作", kind: "credit_pack", credits: 2000, amount: 5900, badge: "最受欢迎", features: ["2,000 积分", "单价更低"] },
      { id: "pack-5000", sku: "credits_5000", name: "进阶包", description: "适合高频图像与视频生成", kind: "credit_pack", credits: 5000, amount: 12900, badge: null, features: ["5,000 积分", "高频创作"] },
      { id: "pack-20000", sku: "credits_20000", name: "团队包", description: "适合团队与批量任务", kind: "credit_pack", credits: 20000, amount: 39900, badge: "最划算", features: ["20,000 积分", "最低单价"] },
    ];
    const insert = this.dbInstance.query(`
      INSERT OR IGNORE INTO billing_products
        (id, sku, name, description, kind, creditsMicros, amountMinor, currency, badge, features, status, sortOrder, createdAt, updatedAt)
      VALUES
        ($id, $sku, $name, $description, $kind, $creditsMicros, $amountMinor, 'CNY', $badge, $features, 'active', $sortOrder, $now, $now)
    `);
    products.forEach((product, index) => insert.run({
      $id: product.id,
      $sku: product.sku,
      $name: product.name,
      $description: product.description,
      $kind: product.kind,
      $creditsMicros: product.credits * 1_000_000,
      $amountMinor: product.amount,
      $badge: product.badge,
      $features: JSON.stringify(product.features),
      $sortOrder: index,
      $now: now,
    }));
  }

  get db(): Database {
    return this.dbInstance;
  }
}
