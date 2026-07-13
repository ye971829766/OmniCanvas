import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { AdminGuard, AuthGuard } from "../auth/auth.guard";
import type { RegisterDto, LoginDto, UpdateProfileDto } from "./user.entity";

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("auth/register")
  async register(@Body() dto: RegisterDto) {
    if (!dto.username || !dto.password) {
      throw new HttpException("用户名和密码不能为空", HttpStatus.BAD_REQUEST);
    }
    return this.usersService.register(dto);
  }

  @Post("auth/login")
  async login(@Body() dto: LoginDto) {
    if (!dto.username || !dto.password) {
      throw new HttpException("用户名和密码不能为空", HttpStatus.BAD_REQUEST);
    }
    return this.usersService.login(dto);
  }

  @Post("auth/google")
  async loginWithGoogle(@Body("idToken") idToken: string) {
    if (!idToken) {
      throw new HttpException("未提供 Google ID Token", HttpStatus.BAD_REQUEST);
    }
    return this.usersService.loginWithGoogle(idToken);
  }

  @UseGuards(AuthGuard)
  @Get("auth/me")
  async getMe(@Req() req: any) {
    const user = await this.usersService.findById(req.user.sub);
    if (!user) {
      throw new HttpException("用户不存在", HttpStatus.NOT_FOUND);
    }
    return user;
  }

  @UseGuards(AuthGuard)
  @Put("users/profile")
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.sub, dto);
  }

  // --- Admin User Management Endpoints ---
  @UseGuards(AdminGuard)
  @Get("admin/users")
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @UseGuards(AdminGuard)
  @Post("admin/users")
  async adminCreateUser(@Body() dto: any) {
    return this.usersService.adminCreateUser(dto);
  }

  @UseGuards(AdminGuard)
  @Put("admin/users/:id")
  async adminUpdateUser(@Param("id") id: string, @Body() dto: any) {
    return this.usersService.adminUpdateUser(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete("admin/users/:id")
  async adminDeleteUser(@Param("id") id: string) {
    return this.usersService.adminDeleteUser(id);
  }
}
