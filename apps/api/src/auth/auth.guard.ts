import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import type { JwtPayload } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = req.cookies?.az_token;

    if (!token) {
      throw new UnauthorizedException('Необходима авторизация');
    }

    try {
      const secret = process.env.JWT_SECRET || 'az-default-secret-change-me';
      const payload = jwt.verify(token, secret) as JwtPayload;
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Сессия истекла, войдите снова');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>(
      ROLES_KEY,
      context.getHandler(),
    );
    if (!roles || roles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;

    if (!user) {
      throw new UnauthorizedException('Необходима авторизация');
    }

    if (!roles.includes(user.role)) {
      throw new UnauthorizedException('Недостаточно прав');
    }

    return true;
  }
}
