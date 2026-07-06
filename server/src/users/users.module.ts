import { Module, Global } from "@nestjs/common";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthGuard, OptionalAuthGuard } from "../auth/auth.guard";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [UsersService, AuthGuard, OptionalAuthGuard],
  exports: [UsersService, AuthGuard, OptionalAuthGuard],
})
export class UsersModule {}
