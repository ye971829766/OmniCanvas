import { Module, forwardRef } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AiModule } from '../ai/ai.module';
import { ModelConfigModule } from '../model-config/model-config.module';

@Module({
  imports: [forwardRef(() => AiModule), ModelConfigModule],
  controllers: [FilesController, AssetsController],
  providers: [FilesService, AssetsService],
  exports: [FilesService, AssetsService],
})
export class FilesModule {}
