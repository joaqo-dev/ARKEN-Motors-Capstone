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
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { SucursalesService } from './sucursales.service';

@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly sucursales: SucursalesService) {}

  @Get()
  listar(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.sucursales.listar(usuario);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.sucursales.obtener(id, usuario);
  }

  @Post()
  @Roles('ADMIN_GENERAL')
  crear(@Body() dto: CreateSucursalDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.sucursales.crear(dto, usuario);
  }

  @Patch(':id')
  @Roles('ADMIN_GENERAL')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSucursalDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.sucursales.actualizar(id, dto, usuario);
  }

  @Post(':id/dar-de-baja')
  @Roles('ADMIN_GENERAL')
  @HttpCode(HttpStatus.NO_CONTENT)
  darDeBaja(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.sucursales.darDeBaja(id, usuario);
  }
}
