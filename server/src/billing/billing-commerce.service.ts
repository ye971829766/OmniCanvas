import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { CREDIT_MICROS } from "./billing.types";
import { StripePaymentService } from "./stripe-payment.service";

@Injectable()
export class BillingCommerceService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly stripe?: StripePaymentService,
  ) {}

  private get db() {
    return this.dbService.db;
  }

  listProducts(includeArchived = false) {
    const rows = this.db.query(`
      SELECT * FROM billing_products
      ${includeArchived ? "" : "WHERE status = 'active'"}
      ORDER BY sortOrder, amountMinor, id
    `).all() as any[];
    return rows.map((row) => this.mapProduct(row));
  }

  createOrder(userId: string, sku: string, idempotencyKey: string) {
    const key = String(idempotencyKey || "").trim();
    if (!key) {
      throw new HttpException(
        { code: "IDEMPOTENCY_KEY_REQUIRED", error: "Idempotency-Key is required" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const product = this.db.query(
      "SELECT * FROM billing_products WHERE sku = $sku AND status = 'active'",
    ).get({ $sku: String(sku || "").trim() }) as any;
    if (!product) throw new NotFoundException("套餐不存在或已下架");

    return this.db.transaction(() => {
      const existing = this.db.query(`
        SELECT * FROM billing_orders WHERE userId = $userId AND idempotencyKey = $key
      `).get({ $userId: userId, $key: key }) as any;
      if (existing) {
        if (existing.sku !== product.sku) {
          throw new ConflictException("Idempotency key was reused for another product");
        }
        return this.mapOrder(existing);
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      const snapshot = JSON.stringify(this.mapProduct(product));
      this.db.query(`
        INSERT INTO billing_orders
          (id, userId, kind, sku, snapshot, amountMinor, currency, status,
           idempotencyKey, provider, providerPaymentId, createdAt, paidAt, updatedAt)
        VALUES
          ($id, $userId, $kind, $sku, $snapshot, $amountMinor, $currency, 'pending',
           $key, NULL, NULL, $now, NULL, $now)
      `).run({
        $id: id,
        $userId: userId,
        $kind: product.kind,
        $sku: product.sku,
        $snapshot: snapshot,
        $amountMinor: Number(product.amountMinor),
        $currency: product.currency,
        $key: key,
        $now: now,
      });
      return this.getOrder(userId, id);
    })();
  }

  listOrders(userId: string, page = 1, pageSize = 20) {
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const offset = (safePage - 1) * safeSize;
    const items = this.db.query(`
      SELECT * FROM billing_orders WHERE userId = $userId
      ORDER BY createdAt DESC, id DESC LIMIT $limit OFFSET $offset
    `).all({ $userId: userId, $limit: safeSize, $offset: offset }) as any[];
    const total = this.db.query(
      "SELECT COUNT(*) AS count FROM billing_orders WHERE userId = ?",
    ).get(userId) as any;
    return {
      items: items.map((row) => this.mapOrder(row)),
      page: safePage,
      pageSize: safeSize,
      total: Number(total?.count || 0),
    };
  }

  getOrder(userId: string, orderId: string) {
    const row = this.db.query(
      "SELECT * FROM billing_orders WHERE id = $id AND userId = $userId",
    ).get({ $id: orderId, $userId: userId }) as any;
    if (!row) throw new NotFoundException("订单不存在");
    return this.mapOrder(row);
  }

  async checkout(userId: string, orderId: string) {
    const order = this.getOrder(userId, orderId);
    if (order.status !== "pending") {
      throw new ConflictException("当前订单状态不可发起支付");
    }
    if (this.stripe?.capabilities().checkoutConfigured) {
      const result = await this.stripe.createCheckout(order);
      const now = new Date().toISOString();
      this.db.query(`
        UPDATE billing_orders
        SET provider = 'stripe', providerPaymentId = $sessionId, updatedAt = $now
        WHERE id = $orderId AND userId = $userId AND status = 'pending'
      `).run({
        $sessionId: result.sessionId,
        $now: now,
        $orderId: order.id,
        $userId: userId,
      });
      return { orderId: order.id, checkoutUrl: result.checkoutUrl, mode: "redirect", provider: "stripe" };
    }
    const template = String(process.env.PAYMENT_CHECKOUT_URL_TEMPLATE || "").trim();
    if (!template) {
      throw new HttpException(
        {
          code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
          error: "支付渠道尚未配置，请联系管理员",
          capabilities: this.paymentCapabilities(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const checkoutUrl = template.replaceAll("{orderId}", encodeURIComponent(order.id));
    let parsed: URL;
    try {
      parsed = new URL(checkoutUrl);
    } catch {
      throw new HttpException("Invalid payment checkout URL configuration", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new HttpException("Payment checkout URL must use HTTPS", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return { orderId: order.id, checkoutUrl: parsed.toString(), mode: "redirect" };
  }

  paymentCapabilities() {
    const stripe = this.stripe?.capabilities();
    if (stripe?.checkoutConfigured) return stripe;
    const configured = Boolean(String(process.env.PAYMENT_CHECKOUT_URL_TEMPLATE || "").trim());
    return {
      checkoutConfigured: configured,
      mode: configured ? "hosted_redirect" : "unconfigured",
      providers: configured ? [String(process.env.PAYMENT_PROVIDER_NAME || "hosted_checkout")] : (stripe?.providers || []),
      stripe: stripe?.stripe,
    };
  }

  adminOverview() {
    const accounts = this.db.query(`
      SELECT COUNT(*) AS accountCount,
             COALESCE(SUM(availableMicros), 0) AS availableMicros,
             COALESCE(SUM(reservedMicros), 0) AS reservedMicros,
             COALESCE(SUM(lifetimeSpentMicros), 0) AS spentMicros
      FROM billing_accounts
    `).get() as any;
    const orders = this.db.query(`
      SELECT COUNT(*) AS totalOrders,
             COALESCE(SUM(CASE WHEN status = 'paid' THEN amountMinor ELSE 0 END), 0) AS paidAmountMinor,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingOrders,
             SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paidOrders
      FROM billing_orders
    `).get() as any;
    const operations = this.db.query(`
      SELECT COUNT(*) AS totalOperations,
             SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reservedOperations,
             SUM(CASE WHEN status = 'captured' THEN 1 ELSE 0 END) AS capturedOperations
      FROM billing_operations
    `).get() as any;
    return {
      accountCount: Number(accounts?.accountCount || 0),
      availableCredits: Number(accounts?.availableMicros || 0) / CREDIT_MICROS,
      reservedCredits: Number(accounts?.reservedMicros || 0) / CREDIT_MICROS,
      lifetimeSpentCredits: Number(accounts?.spentMicros || 0) / CREDIT_MICROS,
      totalOrders: Number(orders?.totalOrders || 0),
      pendingOrders: Number(orders?.pendingOrders || 0),
      paidOrders: Number(orders?.paidOrders || 0),
      paidAmountMinor: Number(orders?.paidAmountMinor || 0),
      currency: "CNY",
      totalOperations: Number(operations?.totalOperations || 0),
      reservedOperations: Number(operations?.reservedOperations || 0),
      capturedOperations: Number(operations?.capturedOperations || 0),
      payment: this.paymentCapabilities(),
    };
  }

  adminListOrders(page = 1, pageSize = 30, status?: string) {
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const safeStatus = ["pending", "paid", "closed", "refunding", "refunded"].includes(status || "")
      ? status
      : undefined;
    const where = safeStatus ? "WHERE o.status = $status" : "";
    const params: Record<string, string | number> = safeStatus ? { $status: safeStatus } : {};
    const rows = this.db.query(`
      SELECT o.*, u.username, u.nickname FROM billing_orders o
      JOIN users u ON u.id = o.userId ${where}
      ORDER BY o.createdAt DESC, o.id DESC LIMIT $limit OFFSET $offset
    `).all({ ...params, $limit: safeSize, $offset: (safePage - 1) * safeSize }) as any[];
    const total = this.db.query(`SELECT COUNT(*) AS count FROM billing_orders o ${where}`)
      .get(params) as any;
    return {
      items: rows.map((row) => ({ ...this.mapOrder(row), username: row.username, nickname: row.nickname })),
      page: safePage,
      pageSize: safeSize,
      total: Number(total?.count || 0),
    };
  }

  adminListAccounts() {
    const rows = this.db.query(`
      SELECT u.id AS userId, u.username, u.nickname, u.avatarUrl,
             COALESCE(a.availableMicros, 0) AS availableMicros,
             COALESCE(a.reservedMicros, 0) AS reservedMicros,
             COALESCE(a.lifetimeGrantedMicros, 0) AS lifetimeGrantedMicros,
             COALESCE(a.lifetimeSpentMicros, 0) AS lifetimeSpentMicros,
             a.updatedAt
      FROM users u LEFT JOIN billing_accounts a ON a.userId = u.id
      ORDER BY a.updatedAt DESC, u.createdAt DESC
    `).all() as any[];
    return rows.map((row) => ({
      userId: row.userId,
      username: row.username,
      nickname: row.nickname,
      avatarUrl: row.avatarUrl,
      availableCredits: Number(row.availableMicros) / CREDIT_MICROS,
      reservedCredits: Number(row.reservedMicros) / CREDIT_MICROS,
      lifetimeGrantedCredits: Number(row.lifetimeGrantedMicros) / CREDIT_MICROS,
      lifetimeSpentCredits: Number(row.lifetimeSpentMicros) / CREDIT_MICROS,
      updatedAt: row.updatedAt || null,
    }));
  }

  getActivePricingRules() {
    const version = this.db.query(`
      SELECT * FROM billing_price_versions WHERE status = 'active'
      ORDER BY publishedAt DESC, createdAt DESC LIMIT 1
    `).get() as any;
    if (!version) return { version: null, rules: [] };
    const rules = this.db.query(`
      SELECT * FROM billing_price_rules WHERE versionId = $versionId
      ORDER BY operation, model, priority DESC
    `).all({ $versionId: version.id }) as any[];
    return {
      version,
      rules: rules.map((row) => ({
        ...row,
        baseCredits: Number(row.baseMicros) / CREDIT_MICROS,
        inputCreditsPerMillionTokens: Number(row.inputMicrosPerMillionTokens) / CREDIT_MICROS,
        outputCreditsPerMillionTokens: Number(row.outputMicrosPerMillionTokens) / CREDIT_MICROS,
        config: this.parseJson(row.config) || {},
      })),
    };
  }

  private mapProduct(row: any) {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      kind: row.kind,
      credits: Number(row.creditsMicros) / CREDIT_MICROS,
      amountMinor: Number(row.amountMinor),
      currency: row.currency,
      badge: row.badge || null,
      features: this.parseJson(row.features) || [],
      status: row.status,
      sortOrder: Number(row.sortOrder),
    };
  }

  private mapOrder(row: any) {
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      sku: row.sku,
      product: this.parseJson(row.snapshot),
      amountMinor: Number(row.amountMinor),
      currency: row.currency,
      status: row.status,
      provider: row.provider || null,
      providerPaymentId: row.providerPaymentId || null,
      createdAt: row.createdAt,
      paidAt: row.paidAt || null,
      updatedAt: row.updatedAt,
    };
  }

  private parseJson(value: unknown): any {
    try {
      return value ? JSON.parse(String(value)) : undefined;
    } catch {
      return undefined;
    }
  }
}
