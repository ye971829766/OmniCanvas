import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { BillingService } from "./billing.service";

@Injectable()
export class BillingReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingReconcilerService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly billing: BillingService) {}

  onModuleInit(): void {
    const run = () => {
      try {
        const count = this.billing.reconcileStaleReservations();
        if (count > 0) this.logger.log(`Reconciled ${count} stale billing reservation(s)`);
      } catch (error) {
        this.logger.error("Billing reconciliation failed", error);
      }
    };
    run();
    this.timer = setInterval(run, 5 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

