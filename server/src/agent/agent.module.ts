import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentMemory } from './agent.memory';
import { ModelConfigModule } from '../model-config/model-config.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [AiModule, ModelConfigModule, UsersModule], // reuse AiService (chat / generate-image / generate-video / tasks)
  controllers: [AgentController],
  providers: [AgentService, AgentMemory],
})
export class AgentModule {}
