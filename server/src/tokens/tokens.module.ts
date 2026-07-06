import { Module, Global } from "@nestjs/common";
import { TokensService } from "./tokens.service";
import { TokensController } from "./tokens.controller";

@Global()
@Module({
  controllers: [TokensController],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
