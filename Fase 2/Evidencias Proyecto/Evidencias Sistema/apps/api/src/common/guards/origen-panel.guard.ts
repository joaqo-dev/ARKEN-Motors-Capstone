import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, AppConfig } from '../../config/env';

// Las rutas de /auth que se saltan el CSRF (login, registro, refresh, etc.) no
// tienen token que validar. Sin este chequeo, un sitio ajeno podría enviar un
// formulario a /auth/login con las credenciales del atacante y dejar a la
// víctima dentro de esa cuenta (login CSRF). Los navegadores siempre envían
// Origin en un POST entre sitios; sin Origin (curl, tests) no hay navegador
// que engañar.
@Injectable()
export class OrigenPanelGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    const origen = req.header('origin');
    if (origen && !this.config.CORS_ORIGINS.includes(origen)) {
      throw new ForbiddenException('Origen no permitido');
    }
    return true;
  }
}
