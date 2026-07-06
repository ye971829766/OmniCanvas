import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers["authorization"] || request.headers["Authorization"];

    if (!authHeader) {
      throw new UnauthorizedException("未提供身份认证 Token");
    }

    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || !token) {
      throw new UnauthorizedException("无效的 Token 格式");
    }

    const payload = this.usersService.verifyToken(token);
    if (!payload) {
      throw new UnauthorizedException("Token 已失效或不合法");
    }

    request.user = payload;
    return true;
  }
}

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers["authorization"] || request.headers["Authorization"];

    if (authHeader) {
      const [type, token] = authHeader.split(" ");
      if (type === "Bearer" && token) {
        const payload = this.usersService.verifyToken(token);
        if (payload) {
          request.user = payload;
        }
      }
    }
    return true;
  }
}
