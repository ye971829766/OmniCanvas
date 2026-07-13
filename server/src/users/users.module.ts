import { Module, Global } from "@nestjs/common";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { DatabaseModule } from "../database/database.module";
import { AdminGuard, AuthGuard, OptionalAuthGuard } from "../auth/auth.guard";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [UsersService, AuthGuard, OptionalAuthGuard, AdminGuard],
  exports: [UsersService, AuthGuard, OptionalAuthGuard, AdminGuard],
})
export class UsersModule {}
