import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { FilesModule } from "./files/files.module";
import { AiModule } from "./ai/ai.module";
import { ChannelsModule } from "./channels/channels.module";
import { ModelConfigModule } from "./model-config/model-config.module";
import { AgentModule } from "./agent/agent.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    FilesModule,
    AiModule,
    ChannelsModule,
    ModelConfigModule,
    AgentModule,
    WorkspacesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
