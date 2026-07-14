import { Module } from "@nestjs/common";
import type { NestModule, MiddlewareConsumer } from "@nestjs/common";
import { AppController } from "./app.controller";
import { FilesModule } from "./files/files.module";
import { AiModule } from "./ai/ai.module";
import { ChannelsModule } from "./channels/channels.module";
import { ModelConfigModule } from "./model-config/model-config.module";
import { AgentModule } from "./agent/agent.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { DatabaseModule } from "./database/database.module";
import { UsersModule } from "./users/users.module";
import { TokensModule } from "./tokens/tokens.module";
import { ApiDecryptionMiddleware } from "./middleware/api-decryption.middleware";
import { ApiCryptoGuardMiddleware } from "./middleware/api-crypto-guard.middleware";
import { RateLimitMiddleware } from "./middleware/rate-limit.middleware";
import { AdminIpWhitelistMiddleware } from "./middleware/admin-ip-whitelist.middleware";
import { BillingModule } from "./billing/billing.module";
import { GatewayModule } from "./gateway/gateway.module";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    TokensModule,
    BillingModule,
    FilesModule,
    AiModule,
    ChannelsModule,
    ModelConfigModule,
    AgentModule,
    WorkspacesModule,
    GatewayModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Order: rate limit → admin IP → crypto surface → body decrypt
    consumer.apply(RateLimitMiddleware).forRoutes("*");
    consumer.apply(AdminIpWhitelistMiddleware).forRoutes("*");
    consumer.apply(ApiCryptoGuardMiddleware).forRoutes("*");
    consumer.apply(ApiDecryptionMiddleware).forRoutes("*");
  }
}
