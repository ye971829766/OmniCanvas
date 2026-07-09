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

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    TokensModule,
    FilesModule,
    AiModule,
    ChannelsModule,
    ModelConfigModule,
    AgentModule,
    WorkspacesModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiDecryptionMiddleware)
      .forRoutes("*");
  }
}
