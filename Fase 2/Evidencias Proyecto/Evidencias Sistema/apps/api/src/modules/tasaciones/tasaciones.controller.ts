import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { descargarPdf } from '../documentos-comerciales/descargar-pdf';
import {
  ListarDocumentosDto,
  MotivoObligatorioDto,
  ResolverOfertaDto,
} from '../documentos-comerciales/dto-comunes';
import { CreateTasacionDto } from './dto/create-tasacion.dto';
import { TasacionesService } from './tasaciones.service';

@Controller('tasaciones')
export class TasacionesController {
  constructor(private readonly tasaciones: TasacionesService) {}

  @Get()
  listar(@Query() filtro: ListarDocumentosDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.tasaciones.listar(filtro, actor);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.tasaciones.obtener(id, actor);
  }

  @Post()
  emitir(@Body() dto: CreateTasacionDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.tasaciones.emitir(dto, actor);
  }

  @Post(':id/resolver')
  resolver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolverOfertaDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.tasaciones.resolver(id, dto.estado, actor);
  }

  @Post(':id/anular')
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotivoObligatorioDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.tasaciones.anular(id, dto.motivo, actor);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const archivo = await this.tasaciones.rutaPdf(id, actor);
    return descargarPdf(res, archivo, `tasacion-${id}.pdf`);
  }
}
