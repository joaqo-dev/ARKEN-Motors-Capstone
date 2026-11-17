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
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { descargarPdf } from '../documentos-comerciales/descargar-pdf';
import { MONTO_MAXIMO } from '../vehiculos/dto/transforms';
import { ConsignacionesService } from './consignaciones.service';
import { ActualizarCondicionesDto } from './dto/actualizar-condiciones.dto';
import { DevolverConsignacionDto } from './dto/devolver-consignacion.dto';
import { ExtenderConsignacionDto } from './dto/extender-consignacion.dto';
import { ListarConsignacionesDto } from './dto/listar-consignaciones.dto';

class LiquidacionQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  precioVenta?: number;
}

@Controller('consignaciones')
export class ConsignacionesController {
  constructor(private readonly consignaciones: ConsignacionesService) {}

  @Get()
  listar(@Query() filtro: ListarConsignacionesDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.consignaciones.listar(filtro, actor);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: UsuarioAutenticado) {
    return this.consignaciones.obtener(id, actor);
  }

  // Documento de consignación (lo firman consignante y automotora).
  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const archivo = await this.consignaciones.rutaPdf(id, actor);
    return descargarPdf(res, archivo, `consignacion-${id}.pdf`);
  }

  @Patch(':id')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  actualizarCondiciones(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarCondicionesDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.consignaciones.actualizarCondiciones(id, dto, actor);
  }

  @Post(':id/extender')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  extender(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtenderConsignacionDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.consignaciones.extender(id, dto, actor);
  }

  @Post(':id/devolver')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  devolver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DevolverConsignacionDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.consignaciones.devolver(id, dto, actor);
  }

  @Get(':id/liquidacion')
  @Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
  liquidacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LiquidacionQueryDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.consignaciones.liquidacion(id, query.precioVenta, actor);
  }
}
