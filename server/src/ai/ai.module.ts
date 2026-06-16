import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChannelsModule } from '../channels/channels.module';
import { ModelConfigModule } from '../model-config/model-config.module';

@Module({
  imports: [FilesModule, ChannelsModule, ModelConfigModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
