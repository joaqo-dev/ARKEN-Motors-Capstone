import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { ListarClientesDto } from './dto/listar-clientes.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

// Todos los roles ven, crean y editan clientes; la ficha es de toda la automotora.
// Desactivar/reactivar queda reservado a los admins.
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  listar(@Query() filtro: ListarClientesDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.clientes.listar(filtro, usuario);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.clientes.obtener(id, usuario);
  }

  @Get(':id/historial')
  historial(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.clientes.historial(id, usuario);
  }

  @Post()
  crear(@Body() dto: CreateClienteDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.clientes.crear(dto, usuario);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClienteDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.clientes.actualizar(id, dto, usuario);
  }

  @Post(':id/desactivar')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  desactivar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.clientes.desactivar(id, usuario);
  }

  @Post(':id/activar')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  activar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.clientes.activar(id, usuario);
  }
}
