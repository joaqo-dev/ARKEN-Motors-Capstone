import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { ListarNotificacionesDto } from './dto/listar-notificaciones.dto';
import { NotificacionesService } from './notificaciones.service';

// Canal solo dentro del sistema (sin email/SMS/push). Todos los roles ven las de
// su sucursal; el ADMIN_GENERAL ve todas las de la automotora.
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  listar(@Query() filtro: ListarNotificacionesDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.notificaciones.listar(filtro, actor);
  }

  @Post(':id/resolver')
  @HttpCode(HttpStatus.NO_CONTENT)
  resolver(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.notificaciones.resolver(id, actor);
  }
}
