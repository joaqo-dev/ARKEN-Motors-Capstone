import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CSRF_COOKIE, CSRF_HEADER } from '../cookies';
import { igualesTiempoConstante } from '../crypto';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';

const METODOS_MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Patrón doble cookie: el header X-CSRF-Token debe coincidir con la cookie csrf_token.
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!METODOS_MUTANTES.has(req.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const cookie: unknown = req.cookies?.[CSRF_COOKIE];
    const header = req.header(CSRF_HEADER);
    if (
      typeof cookie !== 'string' ||
      !cookie ||
      !header ||
      !igualesTiempoConstante(cookie, header)
    ) {
      throw new ForbiddenException('Token CSRF inválido');
    }
    return true;
  }
}
