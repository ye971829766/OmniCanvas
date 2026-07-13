import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { DatabaseService } from "../database/database.service";
import { BillingService } from "./billing.service";

interface CheckoutOrder {
  id: string;
  userId: string;
  sku: string;
  amountMinor: number;
  currency: string;
  product?: { name?: string; description?: string; credits?: number };
}

@Injectable()
export class StripePaymentService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly billing: BillingService,
  ) {}

  capabilities() {
    const secretConfigured = Boolean(this.secretKey());
    const webhookConfigured = Boolean(this.webhookSecret());
    return {
      checkoutConfigured: secretConfigured && webhookConfigured,
      mode: secretConfigured && webhookConfigured ? "stripe_checkout" : "unconfigured",
      providers: secretConfigured ? ["stripe"] : [],
      stripe: {
        secretConfigured,
        publishableConfigured: Boolean(String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim()),
        webhookConfigured,
      },
    };
  }

  async createCheckout(order: CheckoutOrder) {
    if (!this.capabilities().checkoutConfigured) {
      throw new HttpException(
        {
          code: "STRIPE_NOT_CONFIGURED",
          error: "Stripe Checkout 尚未完整配置，需要私钥和 webhook 签名密钥",
          capabilities: this.capabilities(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const frontendUrl = this.validFrontendUrl();
    const stripe = this.client();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: order.id,
        success_url: `${frontendUrl}/canvas?payment=stripe_success&orderId=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/canvas?payment=stripe_cancelled&orderId=${encodeURIComponent(order.id)}`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: order.currency.toLowerCase(),
              unit_amount: order.amountMinor,
              product_data: {
                name: order.product?.name || order.sku,
                description: order.product?.description || `${order.product?.credits || 0} OmniCanvas credits`,
                metadata: { sku: order.sku },
              },
            },
          },
        ],
        metadata: {
          orderId: order.id,
          userId: order.userId,
          sku: order.sku,
        },
      },
      { idempotencyKey: `omnicanvas-order:${order.id}:checkout-v1` },
    );
    if (!session.url) {
      throw new HttpException("Stripe did not return a Checkout URL", HttpStatus.BAD_GATEWAY);
    }
    return { sessionId: session.id, checkoutUrl: session.url };
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException("Stripe webhook requires the raw request body");
    }
    if (!signature) throw new BadRequestException("Missing Stripe-Signature header");
    const webhookSecret = this.webhookSecret();
    if (!webhookSecret) {
      throw new HttpException("Stripe webhook is not configured", HttpStatus.SERVICE_UNAVAILABLE);
    }

    let event: Stripe.Event;
    try {
      event = await this.client().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException("Invalid Stripe webhook signature");
    }

    const db = this.dbService.db;
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const now = new Date().toISOString();
    try {
      return db.transaction(() => {
        const existing = db.query(`
          SELECT status FROM billing_payment_events WHERE provider = 'stripe' AND providerEventId = ?
        `).get(event.id) as { status: string } | null;
        if (existing) return { received: true, duplicate: true, status: existing.status };

        const session = event.data.object as Stripe.Checkout.Session;
        const isCheckoutEvent = event.type === "checkout.session.completed"
          || event.type === "checkout.session.async_payment_succeeded";
        const orderId = isCheckoutEvent
          ? String(session.metadata?.orderId || session.client_reference_id || "")
          : "";
        const referencedOrder = orderId
          ? db.query("SELECT * FROM billing_orders WHERE id = ?").get(orderId) as any
          : null;
        db.query(`
          INSERT INTO billing_payment_events
            (id, provider, providerEventId, orderId, payloadHash, status, error, receivedAt, processedAt)
          VALUES ($id, 'stripe', $eventId, $orderId, $hash, 'received', NULL, $now, NULL)
        `).run({
          $id: crypto.randomUUID(),
          $eventId: event.id,
          $orderId: referencedOrder ? orderId : null,
          $hash: payloadHash,
          $now: now,
        });

        if (!isCheckoutEvent || session.payment_status !== "paid") {
          db.query(`
            UPDATE billing_payment_events SET status = 'processed', processedAt = $now
            WHERE provider = 'stripe' AND providerEventId = $eventId
          `).run({ $now: now, $eventId: event.id });
          return { received: true, processed: false, type: event.type };
        }
        if (!orderId || session.metadata?.orderId !== orderId) {
          throw new Error("Stripe Checkout metadata does not contain a consistent order id");
        }
        const order = referencedOrder;
        if (!order) throw new Error("Stripe Checkout references an unknown order");
        if (String(session.metadata?.userId || "") !== String(order.userId)) {
          throw new Error("Stripe Checkout user does not match the order");
        }
        if (String(session.metadata?.sku || "") !== String(order.sku)) {
          throw new Error("Stripe Checkout SKU does not match the order");
        }
        if (Number(session.amount_total) !== Number(order.amountMinor)) {
          throw new Error("Stripe Checkout amount does not match the order");
        }
        if (String(session.currency || "").toUpperCase() !== String(order.currency).toUpperCase()) {
          throw new Error("Stripe Checkout currency does not match the order");
        }
        const product = this.parseJson(order.snapshot);
        const credits = Number(product?.credits || 0);
        if (!Number.isFinite(credits) || credits <= 0) {
          throw new Error("Order snapshot contains an invalid credit amount");
        }

        this.billing.grantCredits({
          userId: order.userId,
          amountCredits: credits,
          sourceType: "purchase",
          sourceId: session.id,
          metadata: {
            provider: "stripe",
            orderId,
            eventId: event.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          },
        });
        db.query(`
          UPDATE billing_orders
          SET status = 'paid', provider = 'stripe', providerPaymentId = $sessionId,
              paidAt = COALESCE(paidAt, $now), updatedAt = $now
          WHERE id = $orderId AND status IN ('pending', 'paid')
        `).run({ $sessionId: session.id, $now: now, $orderId: orderId });
        db.query(`
          UPDATE billing_payment_events SET status = 'processed', processedAt = $now
          WHERE provider = 'stripe' AND providerEventId = $eventId
        `).run({ $now: now, $eventId: event.id });
        return { received: true, processed: true, orderId };
      })();
    } catch (error: any) {
      const rejectedOrderId = String((event.data.object as any)?.metadata?.orderId || "");
      const rejectedOrderExists = rejectedOrderId
        ? db.query("SELECT id FROM billing_orders WHERE id = ?").get(rejectedOrderId)
        : null;
      db.query(`
        INSERT OR IGNORE INTO billing_payment_events
          (id, provider, providerEventId, orderId, payloadHash, status, error, receivedAt, processedAt)
        VALUES ($id, 'stripe', $eventId, $orderId, $hash, 'rejected', $error, $now, $now)
      `).run({
        $id: crypto.randomUUID(),
        $eventId: event.id,
        $orderId: rejectedOrderExists ? rejectedOrderId : null,
        $hash: payloadHash,
        $error: String(error?.message || "Stripe webhook processing failed").slice(0, 1000),
        $now: now,
      });
      throw new BadRequestException("Stripe webhook payload did not match the order");
    }
  }

  private client(): Stripe {
    const key = this.secretKey();
    if (!key) throw new HttpException("Stripe secret key is not configured", HttpStatus.SERVICE_UNAVAILABLE);
    return new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
  }

  private secretKey(): string {
    return String(process.env.STRIPE_SECRET_KEY || "").trim();
  }

  private webhookSecret(): string {
    return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  }

  private validFrontendUrl(): string {
    const value = String(process.env.FRONTEND_URL || "http://localhost:5173").trim().replace(/\/$/, "");
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new HttpException("FRONTEND_URL must use HTTPS", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return parsed.toString().replace(/\/$/, "");
  }

  private parseJson(value: unknown): any {
    try {
      return value ? JSON.parse(String(value)) : undefined;
    } catch {
      return undefined;
    }
  }
}
