import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { descargarPdf } from '../documentos-comerciales/descargar-pdf';
import { IsBoolean } from 'class-validator';
import {
  ListarDocumentosDto,
  MotivoObligatorioDto,
  NuevaFechaVencimientoDto,
} from '../documentos-comerciales/dto-comunes';

class CancelarReservaDto extends MotivoObligatorioDto {
  // true: la seña se retiene (ingreso); false: se devuelve al cliente.
  @IsBoolean({ message: 'Indica si la seña se retiene (true) o se devuelve (false)' })
  senaRetenida!: boolean;
}
import { CreateReservaDto } from './dto/create-reserva.dto';
import { ReservasService } from './reservas.service';

@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  @Get()
  listar(@Query() filtro: ListarDocumentosDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.reservas.listar(filtro, actor);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.reservas.obtener(id, actor);
  }

  @Post()
  emitir(@Body() dto: CreateReservaDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.reservas.emitir(dto, actor);
  }

  @Post(':id/extender')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  extender(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NuevaFechaVencimientoDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.reservas.extender(id, dto.nuevaFechaVencimiento, actor);
  }

  // Módulo 12: el Vendedor nunca anula/cancela.
  @Post(':id/cancelar')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarReservaDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.reservas.cancelar(id, dto.motivo, dto.senaRetenida, actor);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const archivo = await this.reservas.rutaPdf(id, actor);
    return descargarPdf(res, archivo, `reserva-${id}.pdf`);
  }
}
