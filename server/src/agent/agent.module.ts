import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentMemory } from './agent.memory';
import { ModelConfigModule } from '../model-config/model-config.module';
import { UsersModule } from '../users/users.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [AiModule, FilesModule, ModelConfigModule, UsersModule],
  controllers: [AgentController],
  providers: [AgentService, AgentMemory],
})
export class AgentModule {}
