import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DatabaseService } from "../database/database.service";
import { BillingService } from "./billing.service";
import { BillingCommerceService } from "./billing-commerce.service";
import { PricingService } from "./pricing.service";
import { StripePaymentService } from "./stripe-payment.service";
import Stripe from "stripe";

describe("BillingService", () => {
  let dbService: DatabaseService;
  let billing: BillingService;
  const userId = "billing-test-user";

  beforeEach(async () => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.BILLING_SIGNUP_CREDITS = "100";
    dbService = new DatabaseService();
    await dbService.onModuleInit();
    dbService.db.query(`
      INSERT INTO users (id, username, nickname, passwordHash, role, createdAt, updatedAt)
      VALUES (?, ?, 'Billing Test', 'hash', 'user', ?, ?)
    `).run(userId, `${crypto.randomUUID()}@test.local`, new Date().toISOString(), new Date().toISOString());
    billing = new BillingService(dbService, new PricingService(dbService));
  });

  afterEach(() => {
    dbService.db.close();
    delete process.env.DATABASE_PATH;
    delete process.env.BILLING_SIGNUP_CREDITS;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("reserves once for an idempotency key and captures only the final amount", () => {
    const operation = billing.reserve({
      userId,
      idempotencyKey: "image-request-1",
      operation: "image_generation",
      params: { model: "test-image", quality: "standard", prompt: "draw a cat" },
    });
    expect(operation.reused).toBe(false);
    expect(operation.quotedMicros).toBe(10_000_000);
    expect(billing.getBalance(userId)).toMatchObject({
      availableCredits: 90,
      reservedCredits: 10,
    });

    const replay = billing.reserve({
      userId,
      idempotencyKey: "image-request-1",
      operation: "image_generation",
      params: { model: "test-image", quality: "standard", prompt: "draw a cat" },
    });
    expect(replay.reused).toBe(true);
    expect(replay.id).toBe(operation.id);

    const completed = billing.capture(operation.id, 8_000_000);
    expect(completed.status).toBe("captured");
    expect(completed.finalMicros).toBe(8_000_000);
    expect(billing.getBalance(userId)).toMatchObject({
      availableCredits: 92,
      reservedCredits: 0,
      lifetimeSpentCredits: 8,
    });

    // Terminal settlement is itself idempotent.
    billing.capture(operation.id, 8_000_000);
    expect(billing.getBalance(userId).lifetimeSpentCredits).toBe(8);
  });

  it("rejects reuse of the same key with a different request", () => {
    billing.reserve({
      userId,
      idempotencyKey: "same-key",
      operation: "remove_background",
      params: { source: "first" },
    });
    expect(() => billing.reserve({
      userId,
      idempotencyKey: "same-key",
      operation: "remove_background",
      params: { source: "different" },
    })).toThrow();
  });

  it("settles an asynchronous task only after its terminal state", () => {
    const operation = billing.reserve({
      userId,
      idempotencyKey: "async-image",
      operation: "image_generation",
      params: { prompt: "async" },
    });
    dbService.db.query(`
      INSERT INTO generation_tasks (id, status, data, createdAt, updatedAt)
      VALUES ('task-1', 'generating', '{}', 1, 1)
    `).run();
    billing.attachTask(operation.id, "task-1", userId);
    expect(billing.getOperation(userId, operation.id).status).toBe("reserved");

    billing.settleTask("task-1", "success");
    expect(billing.getOperation(userId, operation.id).status).toBe("captured");
    expect(billing.getBalance(userId)).toMatchObject({
      availableCredits: 90,
      reservedCredits: 0,
      lifetimeSpentCredits: 10,
    });
  });

  it("reserves for every requested image and releases failed batch items", () => {
    const operation = billing.reserve({
      userId,
      idempotencyKey: "batch-image",
      operation: "image_generation",
      params: { prompt: "three variations", n: 3 },
    });
    expect(operation.quotedMicros).toBe(30_000_000);
    expect(billing.getBalance(userId)).toMatchObject({
      availableCredits: 70,
      reservedCredits: 30,
    });

    dbService.db.query(`
      INSERT INTO generation_tasks (id, status, data, createdAt, updatedAt)
      VALUES ('batch-task', 'generating', '{"requestedCount":3,"successfulCount":2}', 1, 1)
    `).run();
    billing.attachTask(operation.id, "batch-task", userId);
    billing.settleTask("batch-task", "success");

    expect(billing.getOperation(userId, operation.id)).toMatchObject({
      status: "captured",
      finalMicros: 20_000_000,
    });
    expect(billing.getBalance(userId)).toMatchObject({
      availableCredits: 80,
      reservedCredits: 0,
      lifetimeSpentCredits: 20,
    });
  });

  it("releases a non-terminal generation task after the maximum reservation age", () => {
    const operation = billing.reserve({
      userId,
      idempotencyKey: "stale-video",
      operation: "video_generation",
      params: { seconds: 5 },
    });
    dbService.db.query(`
      INSERT INTO generation_tasks (id, status, data, createdAt, updatedAt)
      VALUES ('stale-video-task', 'generating', '{"kind":"video"}', 1, 1)
    `).run();
    billing.attachTask(operation.id, "stale-video-task", userId);
    dbService.db.query(`
      UPDATE billing_operations SET updatedAt = '2000-01-01T00:00:00.000Z' WHERE id = ?
    `).run(operation.id);

    expect(billing.reconcileStaleReservations(1)).toBe(1);
    expect(billing.getOperation(userId, operation.id).status).toBe("released");
    expect(dbService.db.query("SELECT status FROM generation_tasks WHERE id = ?")
      .get("stale-video-task")).toMatchObject({ status: "error" });
  });

  it("releases a failed task and prevents concurrent overspending", () => {
    const first = billing.reserve({
      userId,
      idempotencyKey: "video-1",
      operation: "video_generation",
      params: { seconds: 5 },
    });
    billing.reserve({
      userId,
      idempotencyKey: "video-2",
      operation: "video_generation",
      params: { seconds: 5 },
    });
    expect(billing.getBalance(userId)).toMatchObject({ availableCredits: 0, reservedCredits: 100 });
    expect(() => billing.reserve({
      userId,
      idempotencyKey: "remove-while-empty",
      operation: "remove_background",
    })).toThrow();

    billing.release(first.id, "provider failed");
    expect(billing.getBalance(userId)).toMatchObject({ availableCredits: 50, reservedCredits: 50 });
  });

  it("grants purchased credits exactly once for a payment source", () => {
    const first = billing.grantCredits({
      userId,
      amountCredits: 25.5,
      sourceType: "purchase",
      sourceId: "payment-123",
    });
    const replay = billing.grantCredits({
      userId,
      amountCredits: 25.5,
      sourceType: "purchase",
      sourceId: "payment-123",
    });
    expect(first.granted).toBe(true);
    expect(replay.granted).toBe(false);
    expect(replay.balance.availableCredits).toBe(125.5);
    expect(() => billing.grantCredits({
      userId,
      amountCredits: 30,
      sourceType: "purchase",
      sourceId: "payment-123",
    })).toThrow();
  });

  it("applies auditable positive and negative admin adjustments idempotently", () => {
    const positive = billing.adminAdjustCredits({
      userId,
      amountCredits: 20,
      adjustmentId: "adjust-plus",
      actorUserId: "admin-1",
      reason: "support compensation",
    });
    expect(positive.balance.availableCredits).toBe(120);
    const negative = billing.adminAdjustCredits({
      userId,
      amountCredits: -15.5,
      adjustmentId: "adjust-minus",
      actorUserId: "admin-1",
      reason: "correct duplicate grant",
    });
    expect(negative.balance.availableCredits).toBe(104.5);
    const replay = billing.adminAdjustCredits({
      userId,
      amountCredits: -15.5,
      adjustmentId: "adjust-minus",
      actorUserId: "admin-1",
      reason: "correct duplicate grant",
    });
    expect(replay.granted).toBe(false);
    expect(replay.balance.availableCredits).toBe(104.5);
  });

  it("creates catalog orders from server snapshots exactly once", async () => {
    const commerce = new BillingCommerceService(dbService);
    expect(commerce.listProducts()).toHaveLength(4);
    const order = commerce.createOrder(userId, "credits_2000", "order-key-1");
    const replay = commerce.createOrder(userId, "credits_2000", "order-key-1");
    expect(order.id).toBe(replay.id);
    expect(order.amountMinor).toBe(5900);
    expect(order.product.credits).toBe(2000);
    expect(commerce.listOrders(userId).total).toBe(1);
    await expect(commerce.checkout(userId, order.id)).rejects.toThrow();
  });

  it("grants a Stripe Checkout order only after a valid signed webhook", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_unit_test_only";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit_test_only";
    const commerce = new BillingCommerceService(dbService);
    const order = commerce.createOrder(userId, "credits_2000", "stripe-order-key");
    const event = {
      id: "evt_checkout_paid",
      object: "event",
      api_version: "2025-06-30.basil",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "cs_test_paid",
          object: "checkout.session",
          amount_total: 5900,
          currency: "cny",
          client_reference_id: order.id,
          metadata: { orderId: order.id, userId, sku: "credits_2000" },
          payment_intent: "pi_test_paid",
          payment_status: "paid",
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: "checkout.session.completed",
    };
    const payload = JSON.stringify(event);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    const payments = new StripePaymentService(dbService, billing);
    expect(await payments.handleWebhook(Buffer.from(payload), signature)).toMatchObject({
      processed: true,
      orderId: order.id,
    });
    expect(billing.getBalance(userId).availableCredits).toBe(2100);
    expect(await payments.handleWebhook(Buffer.from(payload), signature)).toMatchObject({
      duplicate: true,
      status: "processed",
    });
    expect(billing.getBalance(userId).availableCredits).toBe(2100);
    expect(commerce.getOrder(userId, order.id)).toMatchObject({
      status: "paid",
      provider: "stripe",
      providerPaymentId: "cs_test_paid",
    });
  });
});
