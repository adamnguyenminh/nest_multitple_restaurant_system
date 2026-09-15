// roles.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorator/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Đọc danh sách roles được yêu cầu từ Decorator @Roles() trên Controller Method
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true; // Route không yêu cầu role -> Cho qua
    }

    // 2. Lấy object user (đã được AuthGuard/Middleware gán vào Request trước đó)
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    console.log(user);

    if (!user || !user.role) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập tài nguyên này',
      );
    }

    // 3. Kiểm tra user có chứa ít nhất 1 role yêu cầu không
    const hasRole = requiredRoles.some((role) => user.role.includes(role));
    if (!hasRole) {
      throw new ForbiddenException(
        `Yêu cầu quyền: ${requiredRoles.join(', ')}`,
      );
    }

    return true; // Cho phép đi tiếp vào Controller
  }
}
