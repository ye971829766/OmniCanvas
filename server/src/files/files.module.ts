import { Module, forwardRef } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [forwardRef(() => AiModule)],
  controllers: [FilesController, AssetsController],
  providers: [FilesService, AssetsService],
  exports: [FilesService, AssetsService],
})
export class FilesModule {}
