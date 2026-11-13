import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UsuariosService } from './usuarios.service';

// El Vendedor no administra usuarios.
@Controller('usuarios')
@Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar(@CurrentUser() actor: UsuarioAutenticado) {
    return this.usuarios.listar(actor);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.usuarios.obtener(id, actor);
  }

  @Post()
  invitar(@Body() dto: CreateUsuarioDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.usuarios.invitar(dto, actor);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.usuarios.actualizar(id, dto, actor);
  }

  @Post(':id/desactivar')
  desactivar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.usuarios.desactivar(id, actor);
  }

  @Post(':id/activar')
  activar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.usuarios.activar(id, actor);
  }

  @Post(':id/reenviar-invitacion')
  @HttpCode(HttpStatus.NO_CONTENT)
  reenviarInvitacion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.usuarios.reenviarInvitacion(id, actor);
  }
}
