import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { BalanceService } from './balance.service';
import { AnularGastoDto } from './dto/anular-gasto.dto';
import { CreateGastoDto, CreateGastoOperacionalDto } from './dto/create-gasto.dto';
import { ListarGastosDto } from './dto/listar-gastos.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { GastosService } from './gastos.service';

const ADJUNTO = FileInterceptor('adjunto', { limits: { fileSize: 10 * 1024 * 1024 } });

// El Vendedor no registra ni ve gastos ni márgenes.
@Controller('gastos')
@Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
export class GastosController {
  constructor(private readonly gastos: GastosService) {}

  // Listado/reporte por período, categoría y sucursal.
  @Get()
  listar(@Query() filtro: ListarGastosDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.gastos.listar(filtro, actor);
  }

  // Gasto operacional (sin vehículo), con boleta opcional en "adjunto".
  @Post()
  @UseInterceptors(ADJUNTO)
  crearOperacional(
    @Body() dto: CreateGastoOperacionalDto,
    @UploadedFile() adjunto: Express.Multer.File | undefined,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.gastos.crearOperacional(dto, adjunto, actor);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.gastos.obtener(id, actor);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGastoDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.gastos.actualizar(id, dto, actor);
  }

  @Post(':id/anular')
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularGastoDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.gastos.anular(id, dto, actor);
  }

  @Post(':id/adjunto')
  @UseInterceptors(ADJUNTO)
  reemplazarAdjunto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() adjunto: Express.Multer.File | undefined,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.gastos.reemplazarAdjunto(id, adjunto, actor);
  }

  @Get(':id/adjunto')
  async descargarAdjunto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { ruta, mime } = await this.gastos.rutaAdjunto(id, actor);
    res.set({
      'Content-Type': mime,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(ruta));
  }
}

@Controller('vehiculos')
@Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
export class VehiculoGastosController {
  constructor(
    private readonly gastos: GastosService,
    private readonly balance: BalanceService,
  ) {}

  @Get(':id/gastos')
  listar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.gastos.listarDeVehiculo(id, actor);
  }

  // JSON, o multipart con la boleta en el campo "adjunto".
  @Post(':id/gastos')
  @UseInterceptors(ADJUNTO)
  crear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGastoDto,
    @UploadedFile() adjunto: Express.Multer.File | undefined,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.gastos.crear(id, dto, adjunto, actor);
  }

  @Get(':id/balance')
  balanceVehiculo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.balance.balanceVehiculo(id, actor);
  }
}
