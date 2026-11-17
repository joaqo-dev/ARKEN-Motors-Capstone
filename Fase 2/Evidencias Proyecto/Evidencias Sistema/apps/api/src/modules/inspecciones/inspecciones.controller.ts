import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { MAX_FOTOS_POR_PUNTO } from '@vitriauto/shared-types';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import {
  ActualizarInspeccionDto,
  ActualizarPuntoDto,
  AgregarPuntoDto,
  FinalizarInspeccionDto,
} from './dto/inspeccion.dto';
import { InspeccionesService } from './inspecciones.service';

const MB = 1024 * 1024;
const uuid = new ParseUUIDPipe();

// Informe de inspección pre-compra (Módulo 7.11): cualquier rol con acceso al vehículo.
@Controller()
export class InspeccionesController {
  constructor(private readonly inspecciones: InspeccionesService) {}

  @Get('vehiculos/:id/inspecciones')
  listar(@Param('id', uuid) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.inspecciones.listar(id, actor);
  }

  @Post('vehiculos/:id/inspecciones')
  crear(@Param('id', uuid) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.inspecciones.crear(id, actor);
  }

  @Get('inspecciones/:id')
  obtener(@Param('id', uuid) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.inspecciones.obtener(id, actor);
  }

  @Patch('inspecciones/:id')
  actualizar(
    @Param('id', uuid) id: string,
    @Body() dto: ActualizarInspeccionDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.inspecciones.actualizar(id, dto, actor);
  }

  @Delete('inspecciones/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  descartar(@Param('id', uuid) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.inspecciones.descartar(id, actor);
  }

  @Post('inspecciones/:id/puntos')
  agregarPunto(
    @Param('id', uuid) id: string,
    @Body() dto: AgregarPuntoDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.inspecciones.agregarPunto(id, dto, actor);
  }

  @Patch('inspecciones/:id/puntos/:puntoId')
  actualizarPunto(
    @Param('id', uuid) id: string,
    @Param('puntoId', uuid) puntoId: string,
    @Body() dto: ActualizarPuntoDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.inspecciones.actualizarPunto(id, puntoId, dto, actor);
  }

  @Delete('inspecciones/:id/puntos/:puntoId')
  eliminarPunto(
    @Param('id', uuid) id: string,
    @Param('puntoId', uuid) puntoId: string,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.inspecciones.eliminarPunto(id, puntoId, actor);
  }

  @Post('inspecciones/:id/puntos/:puntoId/fotos')
  @UseInterceptors(
    FilesInterceptor('fotos', MAX_FOTOS_POR_PUNTO, { limits: { fileSize: 12 * MB } }),
  )
  subirFotos(
    @Param('id', uuid) id: string,
    @Param('puntoId', uuid) puntoId: string,
    @UploadedFiles() fotos: Express.Multer.File[] | undefined,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.inspecciones.subirFotos(id, puntoId, fotos ?? [], actor);
  }

  @Delete('inspecciones/:id/fotos/:fotoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminarFoto(
    @Param('id', uuid) id: string,
    @Param('fotoId', uuid) fotoId: string,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.inspecciones.eliminarFoto(id, fotoId, actor);
  }

  @Post('inspecciones/:id/finalizar')
  @HttpCode(HttpStatus.OK)
  finalizar(
    @Param('id', uuid) id: string,
    @Body() dto: FinalizarInspeccionDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.inspecciones.finalizar(id, dto.resultado, actor);
  }

  @Get('inspecciones/:id/pdf')
  async pdf(
    @Param('id', uuid) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, nombre } = await this.inspecciones.generarPdf(id, actor);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nombre}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buffer);
  }
}
