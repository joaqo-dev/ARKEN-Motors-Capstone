import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { FOTOS_MAXIMAS_POR_VEHICULO } from '@vitriauto/shared-types';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { CambiarEstadoVehiculoDto } from './dto/cambiar-estado.dto';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';
import { SubirDocumentoLegalDto } from './dto/documento-legal.dto';
import { ListarVehiculosDto } from './dto/listar-vehiculos.dto';
import { ReordenarFotosDto } from './dto/reordenar-fotos.dto';
import { TransferirVehiculoDto } from './dto/transferir-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';
import { VehiculoArchivosService } from './vehiculo-archivos.service';
import { VehiculosService } from './vehiculos.service';

const MB = 1024 * 1024;

@Controller('vehiculos')
export class VehiculosController {
  constructor(
    private readonly vehiculos: VehiculosService,
    private readonly archivos: VehiculoArchivosService,
  ) {}

  // Declarada antes de ':id' para que no la capture esa ruta.
  @Get('sugerencia-revision-tecnica')
  sugerenciaRevisionTecnica(@Query('patente') patente: string) {
    return this.vehiculos.sugerenciaRevisionTecnica(patente ?? '');
  }

  @Get()
  listar(@Query() filtro: ListarVehiculosDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.vehiculos.listar(filtro, actor);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.vehiculos.obtener(id, actor);
  }

  @Post()
  crear(@Body() dto: CreateVehiculoDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.vehiculos.crear(dto, actor);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehiculoDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.vehiculos.actualizar(id, dto, actor);
  }

  @Post(':id/estado')
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoVehiculoDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.vehiculos.cambiarEstado(id, dto, actor);
  }

  @Post(':id/transferir')
  @Roles('ADMIN_GENERAL')
  transferir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferirVehiculoDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.vehiculos.transferir(id, dto, actor);
  }

  @Get(':id/bitacora')
  bitacora(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.vehiculos.obtenerBitacora(id, actor);
  }

  // ---------- Fotos ----------

  @Post(':id/fotos')
  @UseInterceptors(
    FilesInterceptor('fotos', FOTOS_MAXIMAS_POR_VEHICULO, { limits: { fileSize: 12 * MB } }),
  )
  subirFotos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() fotos: Express.Multer.File[] | undefined,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.archivos.subirFotos(id, fotos ?? [], actor);
  }

  @Put(':id/fotos/orden')
  reordenarFotos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReordenarFotosDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.archivos.reordenarFotos(id, dto.fotoIds, actor);
  }

  @Delete(':id/fotos/:fotoId')
  eliminarFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fotoId', ParseUUIDPipe) fotoId: string,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.archivos.eliminarFoto(id, fotoId, actor);
  }

  // ---------- Documentos legales ----------

  @Get(':id/documentos')
  listarDocumentos(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('incluirHistorial', new ParseBoolPipe({ optional: true }))
    incluirHistorial: boolean | undefined,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.archivos.listarDocumentos(id, incluirHistorial ?? false, actor);
  }

  // Sube un documento nuevo; si ya había uno vigente del mismo tipo, pasa a historial.
  @Post(':id/documentos')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * MB } }))
  subirDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() dto: SubirDocumentoLegalDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.archivos.subirDocumento(id, archivo, dto, actor);
  }

  @Get(':id/documentos/:documentoId/archivo')
  async descargarDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { ruta, mime } = await this.archivos.archivoDocumento(id, documentoId, actor);
    res.set({
      'Content-Type': mime,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(ruta));
  }
}
