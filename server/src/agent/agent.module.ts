import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentMemory } from './agent.memory';

@Module({
  imports: [AiModule], // reuse AiService (chat / generate-image / generate-video / tasks)
  controllers: [AgentController],
  providers: [AgentService, AgentMemory],
})
export class AgentModule {}
