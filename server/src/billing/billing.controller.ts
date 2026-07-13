import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { BillingService } from "./billing.service";
import { BillingCommerceService } from "./billing-commerce.service";
import type { BillingOperationType, BillingQuoteParams } from "./billing.types";

@Controller("billing")
@UseGuards(AuthGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly commerce: BillingCommerceService,
  ) {}

  @Get("catalog")
  getCatalog() {
    return {
      products: this.commerce.listProducts(),
      payment: this.commerce.paymentCapabilities(),
    };
  }

  @Get("balance")
  getBalance(@Req() req: Request) {
    return this.billing.getBalance(this.userId(req));
  }

  @Get("transactions")
  getTransactions(
    @Req() req: Request,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.billing.getTransactions(
      this.userId(req),
      Number(page || 1),
      Number(pageSize || 30),
    );
  }

  @Get("operations/:id")
  getOperation(@Req() req: Request, @Param("id") id: string) {
    return this.billing.getOperation(this.userId(req), id);
  }

  @Get("orders")
  getOrders(
    @Req() req: Request,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.commerce.listOrders(this.userId(req), Number(page || 1), Number(pageSize || 20));
  }

  @Get("orders/:id")
  getOrder(@Req() req: Request, @Param("id") id: string) {
    return this.commerce.getOrder(this.userId(req), id);
  }

  @Post("orders")
  createOrder(
    @Req() req: Request,
    @Body("sku") sku: string,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.commerce.createOrder(this.userId(req), sku, idempotencyKey);
  }

  @Post("orders/:id/checkout")
  checkout(@Req() req: Request, @Param("id") id: string) {
    return this.commerce.checkout(this.userId(req), id);
  }

  @Post("quote")
  quote(@Body() body: { operation: BillingOperationType; params?: BillingQuoteParams }) {
    return this.billing.quote(body.operation, body.params || {});
  }

  private userId(req: Request): string {
    return String((req as any).user?.sub || "");
  }
}
