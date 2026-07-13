import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AdminGuard } from "../auth/auth.guard";
import { BillingCommerceService } from "./billing-commerce.service";
import { BillingService } from "./billing.service";

@Controller("admin/billing")
@UseGuards(AdminGuard)
export class AdminBillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly commerce: BillingCommerceService,
  ) {}

  @Get("overview")
  overview() {
    return this.commerce.adminOverview();
  }

  @Get("accounts")
  accounts() {
    return this.commerce.adminListAccounts();
  }

  @Get("orders")
  orders(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
  ) {
    return this.commerce.adminListOrders(Number(page || 1), Number(pageSize || 30), status);
  }

  @Get("products")
  products() {
    return this.commerce.listProducts(true);
  }

  @Get("pricing")
  pricing() {
    return this.commerce.getActivePricingRules();
  }

  @Post("accounts/:userId/adjust")
  adjust(
    @Req() req: Request,
    @Param("userId") userId: string,
    @Body() body: { amountCredits: number; reason: string },
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.billing.adminAdjustCredits({
      userId,
      amountCredits: body.amountCredits,
      reason: body.reason,
      adjustmentId: idempotencyKey,
      actorUserId: String((req as any).user?.sub || ""),
    });
  }
}
