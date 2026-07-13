import { Controller, Headers, Post, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { StripePaymentService } from "./stripe-payment.service";

@Controller("billing/webhooks")
export class StripeWebhookController {
  constructor(private readonly stripe: StripePaymentService) {}

  @Post("stripe")
  handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature?: string,
  ) {
    return this.stripe.handleWebhook(req.rawBody, signature);
  }
}
