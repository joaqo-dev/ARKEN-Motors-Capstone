import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { EstadoConsignacion, OrdenConsignaciones } from '../consignaciones.repository';

export class ListarConsignacionesDto {
  @IsOptional()
  @IsIn(['ACTIVA', 'VENCIDA', 'DEVUELTA', 'VENDIDA'])
  estado?: EstadoConsignacion;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  // Solo tiene efecto para ADMIN_GENERAL.
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  // Búsqueda: patente, marca/modelo, consignante (nombre o RUT) o N°.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['dias', 'plazo', 'minimo', 'folio'])
  orden?: OrdenConsignaciones;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direccion?: 'asc' | 'desc';

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
