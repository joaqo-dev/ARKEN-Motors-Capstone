import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RolUsuario } from '@vitriauto/shared-types';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { UsuarioAutenticado } from '../usuario-autenticado';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RolUsuario[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    if (!req.user || !roles.includes(req.user.rol)) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    return true;
  }
}
