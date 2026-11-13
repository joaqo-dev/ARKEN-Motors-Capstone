import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { CategoriaGasto, TipoGasto } from '../gastos.repository';
import { CATEGORIAS_GASTO } from './create-gasto.dto';

export class ListarGastosDto {
  @IsOptional()
  @IsDateString({ strict: true })
  desde?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  hasta?: string;

  @IsOptional()
  @IsIn(['VEHICULO', 'OPERACIONAL'])
  tipo?: TipoGasto;

  @IsOptional()
  @IsIn(CATEGORIAS_GASTO)
  categoria?: CategoriaGasto;

  // Solo tiene efecto para ADMIN_GENERAL.
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  // Solo los gastos generales de la automotora (sin sucursal). Solo ADMIN_GENERAL.
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  soloGenerales?: boolean;

  @IsOptional()
  @IsUUID()
  vehiculoId?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  incluirAnulados?: boolean;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
