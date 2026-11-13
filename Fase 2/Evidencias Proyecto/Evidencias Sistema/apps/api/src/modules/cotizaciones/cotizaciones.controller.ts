import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { descargarPdf } from '../documentos-comerciales/descargar-pdf';
import { ListarDocumentosDto, MotivoObligatorioDto } from '../documentos-comerciales/dto-comunes';
import { CotizacionesService } from './cotizaciones.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';

@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizaciones: CotizacionesService) {}

  @Get()
  listar(@Query() filtro: ListarDocumentosDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.cotizaciones.listar(filtro, actor);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.cotizaciones.obtener(id, actor);
  }

  @Post()
  emitir(@Body() dto: CreateCotizacionDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.cotizaciones.emitir(dto, actor);
  }

  @Post(':id/anular')
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotivoObligatorioDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.cotizaciones.anular(id, dto.motivo, actor);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const archivo = await this.cotizaciones.rutaPdf(id, actor);
    return descargarPdf(res, archivo, `cotizacion-${id}.pdf`);
  }
}
