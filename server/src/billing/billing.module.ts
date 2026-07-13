import { Global, Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { AdminBillingController } from "./admin-billing.controller";
import { BillingCommerceService } from "./billing-commerce.service";
import { BillingReconcilerService } from "./billing-reconciler.service";
import { BillingService } from "./billing.service";
import { PricingService } from "./pricing.service";
import { StripePaymentService } from "./stripe-payment.service";
import { StripeWebhookController } from "./stripe-webhook.controller";

@Global()
@Module({
  controllers: [BillingController, AdminBillingController, StripeWebhookController],
  providers: [BillingService, BillingCommerceService, StripePaymentService, PricingService, BillingReconcilerService],
  exports: [BillingService, BillingCommerceService, PricingService],
})
export class BillingModule {}
