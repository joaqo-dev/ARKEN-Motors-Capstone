import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../cookies';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UsuariosRepository } from '../../modules/usuarios/usuarios.repository';
import type { JwtPayload, UsuarioAutenticado } from '../usuario-autenticado';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly usuarios: UsuariosRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException();

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }
    // El access token vive hasta 15 min: sin esta consulta, un usuario desactivado
    // o al que le cambiaron rol/sucursal seguiría operando con sus permisos viejos.
    // El 401 hace que el panel renueve con /auth/refresh, que ya revisa el estado.
    const usuario = await this.usuarios.findById(payload.sub);
    if (
      !usuario ||
      usuario.estado !== 'ACTIVO' ||
      usuario.automotora_id !== payload.automotoraId ||
      usuario.rol !== payload.rol ||
      (usuario.sucursal_id ?? null) !== (payload.sucursalId ?? null)
    ) {
      throw new UnauthorizedException();
    }
    req.user = {
      id: payload.sub,
      automotoraId: payload.automotoraId,
      sucursalId: payload.sucursalId,
      rol: payload.rol,
    };
    return true;
  }
}
