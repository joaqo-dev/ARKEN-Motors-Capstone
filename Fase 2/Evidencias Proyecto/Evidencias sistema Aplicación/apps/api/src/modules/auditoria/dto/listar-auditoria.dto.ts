import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ListarAuditoriaDto {
  @IsOptional()
  @IsDateString({ strict: true })
  desde?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  hasta?: string;

  // Ej. VENTA_ANULADA, VEHICULO_CAMBIO_PRECIO
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]{3,60}$/)
  accion?: string;

  // Ej. VEHICULO, VENTA, GASTO, USUARIO, SUCURSAL
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]{3,30}$/)
  entidadTipo?: string;

  @IsOptional()
  @IsUUID()
  entidadId?: string;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  // Solo tiene efecto para ADMIN_GENERAL.
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  // Solo ADMIN_GENERAL: acciones a nivel de toda la automotora (sucursal_id NULL).
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  soloAutomotora?: boolean;

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
