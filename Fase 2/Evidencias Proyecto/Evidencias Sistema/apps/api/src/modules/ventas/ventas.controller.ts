import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { descargarPdf } from '../documentos-comerciales/descargar-pdf';
import { ListarDocumentosDto, MotivoObligatorioDto } from '../documentos-comerciales/dto-comunes';
import { CreateVentaDto } from './dto/create-venta.dto';
import { VentasService } from './ventas.service';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  @Get()
  listar(@Query() filtro: ListarDocumentosDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.ventas.listar(filtro, actor);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.ventas.obtener(id, actor);
  }

  // Cierre de venta: ADMIN_GENERAL, ADMIN_SUCURSAL y VENDEDOR.
  @Post()
  cerrar(@Body() dto: CreateVentaDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.ventas.cerrar(dto, actor);
  }

  // El Vendedor nunca anula; motivo obligatorio.
  @Post(':id/anular')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotivoObligatorioDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.ventas.anular(id, dto.motivo, actor);
  }

  // Comprobante de venta.
  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const archivo = await this.ventas.rutaPdf(id, actor);
    return descargarPdf(res, archivo, `venta-${id}.pdf`);
  }
}
