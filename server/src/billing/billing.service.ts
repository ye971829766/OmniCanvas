import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { PricingService } from "./pricing.service";
import {
  CREDIT_MICROS,
  type BillingOperationRecord,
  type BillingOperationType,
  type BillingQuote,
  type BillingQuoteParams,
} from "./billing.types";

interface ReserveInput {
  userId: string;
  idempotencyKey: string;
  operation: BillingOperationType;
  params?: BillingQuoteParams;
  metadata?: Record<string, unknown>;
}

export interface ReservedBillingOperation extends BillingOperationRecord {
  reused: boolean;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly pricing: PricingService,
  ) {}

  quote(operation: BillingOperationType, params: BillingQuoteParams = {}): BillingQuote {
    return this.pricing.quote(operation, params);
  }

  quoteForOperation(operationId: string, params: BillingQuoteParams = {}): BillingQuote {
    const operation = this.dbService.db.query(`
      SELECT operation, priceVersionId FROM billing_operations WHERE id = ?
    `).get(operationId) as any;
    if (!operation) throw new NotFoundException("Billing operation not found");
    return this.pricing.quote(operation.operation, params, operation.priceVersionId);
  }

  grantCredits(input: {
    userId: string;
    amountCredits: number;
    sourceType: "purchase" | "subscription" | "gift" | "refund" | "admin_adjust";
    sourceId: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
  }): { granted: boolean; balance: ReturnType<BillingService["getBalance"]> } {
    const amountMicros = Math.floor(Number(input.amountCredits) * CREDIT_MICROS);
    if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) {
      throw new HttpException("Credit grant must be a positive safe amount", HttpStatus.BAD_REQUEST);
    }
    if (!input.sourceId?.trim()) {
      throw new HttpException("Credit grant source id is required", HttpStatus.BAD_REQUEST);
    }
    if (input.expiresAt && !Number.isFinite(Date.parse(input.expiresAt))) {
      throw new HttpException("Invalid credit expiration", HttpStatus.BAD_REQUEST);
    }
    this.ensureAccount(input.userId);
    const db = this.dbService.db;
    const now = new Date().toISOString();
    const grantId = randomUUID();
    let granted = false;
    db.transaction(() => {
      const inserted = db.query(`
        INSERT OR IGNORE INTO billing_credit_grants
          (id, userId, sourceType, sourceId, originalMicros, remainingMicros, reservedMicros,
           expiresAt, metadata, createdAt)
        VALUES ($id, $userId, $sourceType, $sourceId, $amount, $amount, 0,
                $expiresAt, $metadata, $now)
      `).run({
        $id: grantId,
        $userId: input.userId,
        $sourceType: input.sourceType,
        $sourceId: input.sourceId,
        $amount: amountMicros,
        $expiresAt: input.expiresAt || null,
        $metadata: JSON.stringify(input.metadata || {}),
        $now: now,
      });
      if (inserted.changes === 0) {
        const existing = db.query(`
          SELECT originalMicros, expiresAt FROM billing_credit_grants
          WHERE userId = $userId AND sourceType = $sourceType AND sourceId = $sourceId
        `).get({
          $userId: input.userId,
          $sourceType: input.sourceType,
          $sourceId: input.sourceId,
        }) as any;
        if (
          !existing ||
          Number(existing.originalMicros) !== amountMicros ||
          (existing.expiresAt || null) !== (input.expiresAt || null)
        ) {
          throw new ConflictException("Credit grant source was reused with different terms");
        }
        return;
      }
      granted = true;
      db.query(`
        UPDATE billing_accounts
        SET availableMicros = availableMicros + $amount,
            lifetimeGrantedMicros = lifetimeGrantedMicros + $amount,
            version = version + 1, updatedAt = $now
        WHERE userId = $userId
      `).run({ $amount: amountMicros, $now: now, $userId: input.userId });
      const account = this.accountRow(input.userId);
      this.insertLedger({
        userId: input.userId,
        grantId,
        type: "grant",
        availableDeltaMicros: amountMicros,
        reservedDeltaMicros: 0,
        consumedDeltaMicros: 0,
        availableAfterMicros: account.availableMicros,
        reservedAfterMicros: account.reservedMicros,
        idempotencyKey: `grant:${input.userId}:${input.sourceType}:${input.sourceId}`,
        metadata: { sourceType: input.sourceType, sourceId: input.sourceId },
      });
    })();
    return { granted, balance: this.getBalance(input.userId) };
  }

  adminAdjustCredits(input: {
    userId: string;
    amountCredits: number;
    adjustmentId: string;
    actorUserId: string;
    reason: string;
  }) {
    const amountCredits = Number(input.amountCredits);
    if (!Number.isFinite(amountCredits) || amountCredits === 0) {
      throw new HttpException("Adjustment amount must be non-zero", HttpStatus.BAD_REQUEST);
    }
    const adjustmentId = String(input.adjustmentId || "").trim();
    const reason = String(input.reason || "").trim();
    if (!adjustmentId || !reason) {
      throw new HttpException("Adjustment id and reason are required", HttpStatus.BAD_REQUEST);
    }
    if (amountCredits > 0) {
      return this.grantCredits({
        userId: input.userId,
        amountCredits,
        sourceType: "admin_adjust",
        sourceId: adjustmentId,
        metadata: { actorUserId: input.actorUserId, reason },
      });
    }

    const amountMicros = Math.floor(Math.abs(amountCredits) * CREDIT_MICROS);
    if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) {
      throw new HttpException("Invalid adjustment amount", HttpStatus.BAD_REQUEST);
    }
    this.ensureAccount(input.userId);
    this.expireAvailableCredits(input.userId);
    const db = this.dbService.db;
    const key = `admin-adjust:${input.userId}:${adjustmentId}`;
    let adjusted = false;
    db.transaction(() => {
      const existing = db.query(
        "SELECT metadata FROM billing_ledger_entries WHERE idempotencyKey = ?",
      ).get(key) as any;
      if (existing) {
        const metadata = this.parseJson(existing.metadata) || {};
        if (Number(metadata.amountMicros) !== -amountMicros) {
          throw new ConflictException("Adjustment id was reused with a different amount");
        }
        return;
      }
      const account = this.accountRow(input.userId);
      if (account.availableMicros < amountMicros) {
        throw new HttpException(
          { code: "INSUFFICIENT_CREDITS", error: "用户可用积分不足，无法完成扣减" },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      let remaining = amountMicros;
      const grants = db.query(`
        SELECT id, remainingMicros, reservedMicros FROM billing_credit_grants
        WHERE userId = $userId AND remainingMicros > reservedMicros
          AND (expiresAt IS NULL OR expiresAt > $now)
        ORDER BY CASE WHEN expiresAt IS NULL THEN 1 ELSE 0 END, expiresAt, createdAt, id
      `).all({ $userId: input.userId, $now: new Date().toISOString() }) as any[];
      for (const grant of grants) {
        if (remaining <= 0) break;
        const spendable = Number(grant.remainingMicros) - Number(grant.reservedMicros);
        const deducted = Math.min(spendable, remaining);
        db.query("UPDATE billing_credit_grants SET remainingMicros = remainingMicros - $amount WHERE id = $id")
          .run({ $amount: deducted, $id: grant.id });
        remaining -= deducted;
      }
      if (remaining !== 0) throw new Error("Billing grant projection invariant violated");
      const now = new Date().toISOString();
      db.query(`
        UPDATE billing_accounts
        SET availableMicros = availableMicros - $amount,
            version = version + 1, updatedAt = $now
        WHERE userId = $userId AND availableMicros >= $amount
      `).run({ $amount: amountMicros, $now: now, $userId: input.userId });
      const after = this.accountRow(input.userId);
      this.insertLedger({
        userId: input.userId,
        type: "admin_adjust",
        availableDeltaMicros: -amountMicros,
        reservedDeltaMicros: 0,
        consumedDeltaMicros: 0,
        availableAfterMicros: after.availableMicros,
        reservedAfterMicros: after.reservedMicros,
        idempotencyKey: key,
        metadata: { amountMicros: -amountMicros, actorUserId: input.actorUserId, reason },
      });
      adjusted = true;
    })();
    return { granted: adjusted, balance: this.getBalance(input.userId) };
  }

  ensureAccount(userId: string): void {
    if (!userId) throw new HttpException("Missing authenticated user", HttpStatus.UNAUTHORIZED);
    const db = this.dbService.db;
    const now = new Date().toISOString();
    const configuredSignupCredits = Number(process.env.BILLING_SIGNUP_CREDITS ?? 100);
    const signupCredits = Number.isFinite(configuredSignupCredits)
      ? Math.max(0, configuredSignupCredits)
      : 100;
    const signupMicros = Math.floor(signupCredits * CREDIT_MICROS);

    db.transaction(() => {
      db.query(`
        INSERT OR IGNORE INTO billing_accounts
          (userId, availableMicros, reservedMicros, lifetimeGrantedMicros, lifetimeSpentMicros, version, createdAt, updatedAt)
        VALUES ($userId, 0, 0, 0, 0, 0, $now, $now)
      `).run({ $userId: userId, $now: now });

      if (signupMicros <= 0) return;
      const grantId = `signup:${userId}`;
      const inserted = db.query(`
        INSERT OR IGNORE INTO billing_credit_grants
          (id, userId, sourceType, sourceId, originalMicros, remainingMicros, reservedMicros, expiresAt, metadata, createdAt)
        VALUES ($id, $userId, 'signup', $sourceId, $amount, $amount, 0, NULL, $metadata, $now)
      `).run({
        $id: grantId,
        $userId: userId,
        $sourceId: userId,
        $amount: signupMicros,
        $metadata: JSON.stringify({ reason: "signup_credit" }),
        $now: now,
      });
      if (inserted.changes === 0) return;

      db.query(`
        UPDATE billing_accounts
        SET availableMicros = availableMicros + $amount,
            lifetimeGrantedMicros = lifetimeGrantedMicros + $amount,
            version = version + 1, updatedAt = $now
        WHERE userId = $userId
      `).run({ $amount: signupMicros, $now: now, $userId: userId });
      const account = this.accountRow(userId);
      this.insertLedger({
        userId,
        grantId,
        type: "grant",
        availableDeltaMicros: signupMicros,
        reservedDeltaMicros: 0,
        consumedDeltaMicros: 0,
        availableAfterMicros: account.availableMicros,
        reservedAfterMicros: account.reservedMicros,
        idempotencyKey: `grant:signup:${userId}`,
        metadata: { sourceType: "signup" },
      });
    })();
  }

  getBalance(userId: string) {
    this.ensureAccount(userId);
    this.expireAvailableCredits(userId);
    const row = this.accountRow(userId);
    return {
      userId,
      availableMicros: row.availableMicros,
      reservedMicros: row.reservedMicros,
      availableCredits: row.availableMicros / CREDIT_MICROS,
      reservedCredits: row.reservedMicros / CREDIT_MICROS,
      lifetimeGrantedCredits: row.lifetimeGrantedMicros / CREDIT_MICROS,
      lifetimeSpentCredits: row.lifetimeSpentMicros / CREDIT_MICROS,
      version: row.version,
      updatedAt: row.updatedAt,
    };
  }

  reserve(input: ReserveInput): ReservedBillingOperation {
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (!idempotencyKey) {
      throw new HttpException(
        { code: "IDEMPOTENCY_KEY_REQUIRED", error: "Idempotency-Key is required" },
        HttpStatus.BAD_REQUEST,
      );
    }
    this.ensureAccount(input.userId);
    this.expireAvailableCredits(input.userId);
    const params = input.params || {};
    const quote = this.quote(input.operation, params);
    const requestHash = this.hash({ operation: input.operation, params });
    const db = this.dbService.db;

    return db.transaction(() => {
      const existing = db.query(`
        SELECT * FROM billing_operations
        WHERE userId = $userId AND idempotencyKey = $key
      `).get({ $userId: input.userId, $key: idempotencyKey }) as any;
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: "IDEMPOTENCY_KEY_REUSED",
            error: "Idempotency key was already used with different parameters",
          });
        }
        return { ...this.mapOperation(existing), reused: true };
      }

      const now = new Date().toISOString();
      const operationId = randomUUID();
      const accountUpdate = db.query(`
        UPDATE billing_accounts
        SET availableMicros = availableMicros - $amount,
            reservedMicros = reservedMicros + $amount,
            version = version + 1, updatedAt = $now
        WHERE userId = $userId AND availableMicros >= $amount
      `).run({
        $amount: quote.amountMicros,
        $now: now,
        $userId: input.userId,
      });
      if (accountUpdate.changes !== 1) {
        const account = this.accountRow(input.userId);
        throw new HttpException(
          {
            code: "INSUFFICIENT_CREDITS",
            error: "积分不足，请充值后再试",
            requiredCredits: quote.credits,
            availableCredits: account.availableMicros / CREDIT_MICROS,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      db.query(`
        INSERT INTO billing_operations
          (id, userId, idempotencyKey, operation, status, quotedMicros, finalMicros,
           priceVersionId, requestHash, taskId, metadata, error, createdAt, updatedAt)
        VALUES ($id, $userId, $key, $operation, 'reserved', $quoted, NULL,
                $priceVersionId, $requestHash, NULL, $metadata, NULL, $now, $now)
      `).run({
        $id: operationId,
        $userId: input.userId,
        $key: idempotencyKey,
        $operation: input.operation,
        $quoted: quote.amountMicros,
        $priceVersionId: quote.priceVersionId,
        $requestHash: requestHash,
        $metadata: JSON.stringify({ quote: this.quoteContext(params), ...(input.metadata || {}) }),
        $now: now,
      });

      let remaining = quote.amountMicros;
      const grants = db.query(`
        SELECT * FROM billing_credit_grants
        WHERE userId = $userId AND remainingMicros > reservedMicros
          AND (expiresAt IS NULL OR expiresAt > $now)
        ORDER BY CASE WHEN expiresAt IS NULL THEN 1 ELSE 0 END, expiresAt, createdAt, id
      `).all({ $userId: input.userId, $now: now }) as any[];
      for (const grant of grants) {
        if (remaining <= 0) break;
        const available = Number(grant.remainingMicros) - Number(grant.reservedMicros);
        const allocated = Math.min(available, remaining);
        if (allocated <= 0) continue;
        db.query(`
          UPDATE billing_credit_grants
          SET reservedMicros = reservedMicros + $amount
          WHERE id = $id
        `).run({ $amount: allocated, $id: grant.id });
        db.query(`
          INSERT INTO billing_allocations
            (id, operationId, grantId, reservedMicros, capturedMicros, releasedMicros, createdAt, updatedAt)
          VALUES ($id, $operationId, $grantId, $amount, 0, 0, $now, $now)
        `).run({
          $id: randomUUID(),
          $operationId: operationId,
          $grantId: grant.id,
          $amount: allocated,
          $now: now,
        });
        remaining -= allocated;
      }
      if (remaining !== 0) throw new Error("Billing grant/account invariant violated");

      const account = this.accountRow(input.userId);
      this.insertLedger({
        userId: input.userId,
        operationId,
        type: "reserve",
        availableDeltaMicros: -quote.amountMicros,
        reservedDeltaMicros: quote.amountMicros,
        consumedDeltaMicros: 0,
        availableAfterMicros: account.availableMicros,
        reservedAfterMicros: account.reservedMicros,
        idempotencyKey: `reserve:${operationId}`,
        metadata: { operation: input.operation, priceVersionId: quote.priceVersionId },
      });

      const created = db.query("SELECT * FROM billing_operations WHERE id = ?").get(operationId) as any;
      return { ...this.mapOperation(created), reused: false };
    })();
  }

  attachTask(operationId: string, taskId: string, userId: string): void {
    const db = this.dbService.db;
    db.transaction(() => {
      const operation = db.query("SELECT * FROM billing_operations WHERE id = ?").get(operationId) as any;
      if (!operation || operation.userId !== userId) throw new NotFoundException("Billing operation not found");
      if (operation.taskId && operation.taskId !== taskId) {
        throw new ConflictException("Billing operation is already attached to another task");
      }
      const now = new Date().toISOString();
      db.query(`
        UPDATE billing_operations SET taskId = $taskId, updatedAt = $now WHERE id = $id
      `).run({ $taskId: taskId, $now: now, $id: operationId });
      const taskUpdate = db.query(`
        UPDATE generation_tasks
        SET userId = $userId, billingOperationId = $operationId, updatedAt = $updatedAt
        WHERE id = $taskId
      `).run({
        $userId: userId,
        $operationId: operationId,
        $updatedAt: Date.now(),
        $taskId: taskId,
      });
      if (taskUpdate.changes !== 1) throw new NotFoundException("Generation task not found");
    })();

    const task = db.query("SELECT status, data FROM generation_tasks WHERE id = ?").get(taskId) as any;
    if (task) this.settleTask(taskId, task.status, this.taskError(task.data));
  }

  settleTask(
    taskId: string,
    status: string,
    error?: string,
    finalMicros?: number,
  ): void {
    const normalized = String(status || "").toLowerCase();
    const operation = this.dbService.db.query(`
      SELECT id, operation, quotedMicros, priceVersionId, metadata FROM billing_operations WHERE taskId = ?
    `).get(taskId) as any;
    if (!operation) return;
    if (["success", "done", "completed", "succeeded"].includes(normalized)) {
      let resolvedFinalMicros = finalMicros;
      if (resolvedFinalMicros === undefined && operation.operation === "image_generation") {
        const task = this.dbService.db.query(
          "SELECT data FROM generation_tasks WHERE id = ?",
        ).get(taskId) as any;
        const taskData = this.parseJson(task?.data);
        const requestedCount = Number(taskData?.requestedCount);
        const successfulCount = Number(taskData?.successfulCount);
        if (
          Number.isSafeInteger(requestedCount) && requestedCount > 0 &&
          Number.isSafeInteger(successfulCount) && successfulCount > 0 &&
          successfulCount <= requestedCount
        ) {
          const metadata = this.parseJson(operation.metadata) || {};
          resolvedFinalMicros = Math.min(Number(operation.quotedMicros), this.pricing.quote(
            "image_generation",
            { ...(metadata.quote || {}), n: successfulCount },
            operation.priceVersionId,
          ).amountMicros);
        }
      }
      this.capture(operation.id, resolvedFinalMicros);
    } else if (["error", "failed", "cancelled", "canceled"].includes(normalized)) {
      this.release(operation.id, error || "Generation failed");
    }
  }

  capture(operationId: string, finalMicros?: number): BillingOperationRecord {
    return this.finish(operationId, "captured", finalMicros);
  }

  release(operationId: string, error?: string): BillingOperationRecord {
    return this.finish(operationId, "released", 0, error);
  }

  getOperation(userId: string, operationId: string): BillingOperationRecord {
    const row = this.dbService.db.query(`
      SELECT * FROM billing_operations WHERE id = $id AND userId = $userId
    `).get({ $id: operationId, $userId: userId }) as any;
    if (!row) throw new NotFoundException("Billing operation not found");
    return this.mapOperation(row);
  }

  getTransactions(userId: string, page = 1, pageSize = 30) {
    this.ensureAccount(userId);
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const offset = (safePage - 1) * safeSize;
    const rows = this.dbService.db.query(`
      SELECT * FROM billing_ledger_entries
      WHERE userId = $userId
      ORDER BY createdAt DESC, id DESC
      LIMIT $limit OFFSET $offset
    `).all({ $userId: userId, $limit: safeSize, $offset: offset }) as any[];
    const total = this.dbService.db.query(`
      SELECT COUNT(*) AS count FROM billing_ledger_entries WHERE userId = ?
    `).get(userId) as any;
    return {
      items: rows.map((row) => ({
        ...row,
        availableDeltaCredits: Number(row.availableDeltaMicros) / CREDIT_MICROS,
        reservedDeltaCredits: Number(row.reservedDeltaMicros) / CREDIT_MICROS,
        consumedDeltaCredits: Number(row.consumedDeltaMicros) / CREDIT_MICROS,
        metadata: this.parseJson(row.metadata),
      })),
      page: safePage,
      pageSize: safeSize,
      total: Number(total?.count || 0),
    };
  }

  reconcileStaleReservations(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const stale = this.dbService.db.query(`
      SELECT id, taskId, updatedAt FROM billing_operations
      WHERE status = 'reserved' AND (taskId IS NOT NULL OR updatedAt < $cutoff)
    `).all({ $cutoff: cutoff }) as any[];
    let settled = 0;
    for (const operation of stale) {
      if (operation.taskId) {
        const task = this.dbService.db.query("SELECT status, data FROM generation_tasks WHERE id = ?").get(operation.taskId) as any;
        if (task) {
          const isTerminal = ["success", "done", "completed", "succeeded", "error", "failed", "cancelled", "canceled"]
            .includes(String(task.status || "").toLowerCase());
          if (!isTerminal && operation.updatedAt < cutoff) {
            const error = "Generation task exceeded the maximum reservation age";
            this.dbService.db.query(`
              UPDATE generation_tasks SET status = 'error', data = $data, updatedAt = $updatedAt WHERE id = $id
            `).run({
              $data: JSON.stringify({ error }),
              $updatedAt: Date.now(),
              $id: operation.taskId,
            });
            this.release(operation.id, error);
            settled++;
            continue;
          }
          const before = this.dbService.db.query("SELECT status FROM billing_operations WHERE id = ?").get(operation.id) as any;
          this.settleTask(operation.taskId, task.status, this.taskError(task.data));
          const after = this.dbService.db.query("SELECT status FROM billing_operations WHERE id = ?").get(operation.id) as any;
          if (before?.status !== after?.status) settled++;
        } else if (operation.updatedAt < cutoff) {
          this.release(operation.id, "Stale reservation points to a missing generation task");
          settled++;
        }
      } else {
        this.release(operation.id, "Stale reservation without an attached task");
        settled++;
      }
    }
    return settled;
  }

  private finish(
    operationId: string,
    outcome: "captured" | "released",
    requestedFinalMicros?: number,
    error?: string,
  ): BillingOperationRecord {
    const db = this.dbService.db;
    return db.transaction(() => {
      const operation = db.query("SELECT * FROM billing_operations WHERE id = ?").get(operationId) as any;
      if (!operation) throw new NotFoundException("Billing operation not found");
      if (operation.status !== "reserved") return this.mapOperation(operation);

      const quoted = Number(operation.quotedMicros);
      const finalMicros = outcome === "captured"
        ? Math.max(0, Math.ceil(requestedFinalMicros ?? quoted))
        : 0;
      if (finalMicros > quoted) {
        throw new ConflictException("Final charge cannot exceed the reserved quote");
      }

      const now = new Date().toISOString();
      const allocations = db.query(`
        SELECT a.*, g.expiresAt FROM billing_allocations a
        JOIN billing_credit_grants g ON g.id = a.grantId
        WHERE a.operationId = $operationId
        ORDER BY a.createdAt, a.id
      `).all({ $operationId: operationId }) as any[];
      let captureRemaining = finalMicros;
      let returnedToAvailable = 0;
      let expiredOnRelease = 0;

      for (const allocation of allocations) {
        const reserved = Number(allocation.reservedMicros);
        const captured = Math.min(reserved, captureRemaining);
        const released = reserved - captured;
        captureRemaining -= captured;
        const expired = Boolean(allocation.expiresAt && allocation.expiresAt <= now);

        db.query(`
          UPDATE billing_credit_grants
          SET reservedMicros = reservedMicros - $reserved,
              remainingMicros = remainingMicros - $consumed
          WHERE id = $grantId
        `).run({
          $reserved: reserved,
          $consumed: captured + (expired ? released : 0),
          $grantId: allocation.grantId,
        });
        db.query(`
          UPDATE billing_allocations
          SET capturedMicros = $captured, releasedMicros = $released, updatedAt = $now
          WHERE id = $id
        `).run({ $captured: captured, $released: released, $now: now, $id: allocation.id });
        if (expired) expiredOnRelease += released;
        else returnedToAvailable += released;
      }
      if (captureRemaining !== 0) throw new Error("Billing allocation invariant violated");

      const accountUpdate = db.query(`
        UPDATE billing_accounts
        SET availableMicros = availableMicros + $returned,
            reservedMicros = reservedMicros - $quoted,
            lifetimeSpentMicros = lifetimeSpentMicros + $final,
            version = version + 1, updatedAt = $now
        WHERE userId = $userId AND reservedMicros >= $quoted
      `).run({
        $returned: returnedToAvailable,
        $quoted: quoted,
        $final: finalMicros,
        $now: now,
        $userId: operation.userId,
      });
      if (accountUpdate.changes !== 1) throw new Error("Billing account reservation invariant violated");
      db.query(`
        UPDATE billing_operations
        SET status = $status, finalMicros = $final, error = $error, updatedAt = $now
        WHERE id = $id
      `).run({
        $status: outcome,
        $final: finalMicros,
        $error: error || null,
        $now: now,
        $id: operationId,
      });

      const account = this.accountRow(operation.userId);
      this.insertLedger({
        userId: operation.userId,
        operationId,
        type: outcome === "captured" ? "capture" : "release",
        availableDeltaMicros: returnedToAvailable,
        reservedDeltaMicros: -quoted,
        consumedDeltaMicros: finalMicros,
        availableAfterMicros: account.availableMicros,
        reservedAfterMicros: account.reservedMicros,
        idempotencyKey: `${outcome}:${operationId}`,
        metadata: { expiredOnReleaseMicros: expiredOnRelease, error },
      });

      const finished = db.query("SELECT * FROM billing_operations WHERE id = ?").get(operationId) as any;
      return this.mapOperation(finished);
    })();
  }

  private expireAvailableCredits(userId: string): void {
    const db = this.dbService.db;
    const now = new Date().toISOString();
    db.transaction(() => {
      const grants = db.query(`
        SELECT * FROM billing_credit_grants
        WHERE userId = $userId AND expiresAt IS NOT NULL AND expiresAt <= $now
          AND remainingMicros > reservedMicros
      `).all({ $userId: userId, $now: now }) as any[];
      for (const grant of grants) {
        const expired = Number(grant.remainingMicros) - Number(grant.reservedMicros);
        if (expired <= 0) continue;
        db.query(`
          UPDATE billing_credit_grants SET remainingMicros = reservedMicros WHERE id = $id
        `).run({ $id: grant.id });
        db.query(`
          UPDATE billing_accounts
          SET availableMicros = availableMicros - $expired,
              version = version + 1, updatedAt = $now
          WHERE userId = $userId AND availableMicros >= $expired
        `).run({ $expired: expired, $now: now, $userId: userId });
        const account = this.accountRow(userId);
        this.insertLedger({
          userId,
          grantId: grant.id,
          type: "expire",
          availableDeltaMicros: -expired,
          reservedDeltaMicros: 0,
          consumedDeltaMicros: 0,
          availableAfterMicros: account.availableMicros,
          reservedAfterMicros: account.reservedMicros,
          idempotencyKey: `expire:${grant.id}:${grant.expiresAt}`,
          metadata: { expiresAt: grant.expiresAt },
        });
      }
    })();
  }

  private accountRow(userId: string): any {
    const row = this.dbService.db.query("SELECT * FROM billing_accounts WHERE userId = ?").get(userId) as any;
    if (!row) throw new NotFoundException("Billing account not found");
    return {
      ...row,
      availableMicros: Number(row.availableMicros),
      reservedMicros: Number(row.reservedMicros),
      lifetimeGrantedMicros: Number(row.lifetimeGrantedMicros),
      lifetimeSpentMicros: Number(row.lifetimeSpentMicros),
      version: Number(row.version),
    };
  }

  private insertLedger(input: {
    userId: string;
    operationId?: string;
    grantId?: string;
    type: string;
    availableDeltaMicros: number;
    reservedDeltaMicros: number;
    consumedDeltaMicros: number;
    availableAfterMicros: number;
    reservedAfterMicros: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.dbService.db.query(`
      INSERT OR IGNORE INTO billing_ledger_entries
        (id, userId, operationId, grantId, type, availableDeltaMicros, reservedDeltaMicros,
         consumedDeltaMicros, availableAfterMicros, reservedAfterMicros, idempotencyKey, metadata, createdAt)
      VALUES ($id, $userId, $operationId, $grantId, $type, $availableDelta, $reservedDelta,
              $consumedDelta, $availableAfter, $reservedAfter, $key, $metadata, $createdAt)
    `).run({
      $id: randomUUID(),
      $userId: input.userId,
      $operationId: input.operationId || null,
      $grantId: input.grantId || null,
      $type: input.type,
      $availableDelta: input.availableDeltaMicros,
      $reservedDelta: input.reservedDeltaMicros,
      $consumedDelta: input.consumedDeltaMicros,
      $availableAfter: input.availableAfterMicros,
      $reservedAfter: input.reservedAfterMicros,
      $key: input.idempotencyKey,
      $metadata: JSON.stringify(input.metadata || {}),
      $createdAt: new Date().toISOString(),
    });
  }

  private mapOperation(row: any): BillingOperationRecord {
    return {
      id: row.id,
      userId: row.userId,
      idempotencyKey: row.idempotencyKey,
      operation: row.operation,
      status: row.status,
      quotedMicros: Number(row.quotedMicros),
      finalMicros: row.finalMicros === null || row.finalMicros === undefined
        ? undefined
        : Number(row.finalMicros),
      priceVersionId: row.priceVersionId,
      requestHash: row.requestHash,
      taskId: row.taskId || undefined,
      metadata: this.parseJson(row.metadata),
      error: row.error || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private hash(value: unknown): string {
    return createHash("sha256").update(this.stableStringify(value)).digest("hex");
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
        `${JSON.stringify(key)}:${this.stableStringify((value as any)[key])}`,
      ).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  private parseJson(value: unknown): any {
    try {
      return value ? JSON.parse(String(value)) : undefined;
    } catch {
      return undefined;
    }
  }

  private taskError(data: unknown): string | undefined {
    const parsed = this.parseJson(data);
    return parsed?.error ? String(parsed.error) : undefined;
  }

  private quoteContext(params: BillingQuoteParams): Record<string, unknown> {
    const allowed = [
      "model",
      "quality",
      "size",
      "seconds",
      "scale",
      "promptTokens",
      "completionTokens",
      "referenceCount",
      "rectangleCount",
      "localized",
      "hasReference",
      "aspectRatio",
      "n",
    ];
    return Object.fromEntries(
      allowed
        .filter((key) => params[key] !== undefined)
        .map((key) => [key, params[key]]),
    );
  }
}
