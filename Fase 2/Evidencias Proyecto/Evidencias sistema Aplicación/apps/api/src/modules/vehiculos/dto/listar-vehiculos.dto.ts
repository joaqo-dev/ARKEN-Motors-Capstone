import { EstadoVehiculo, OrigenVehiculo } from '@vitriauto/shared-types';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { trim } from './transforms';

export const ORDENES_VEHICULO = ['estado', 'precio', 'costo', 'dias'] as const;
export type OrdenVehiculo = (typeof ORDENES_VEHICULO)[number];

export class ListarVehiculosDto {
  @IsOptional()
  @IsIn(EstadoVehiculo.options)
  estado?: EstadoVehiculo;

  // Solo lo que está en inventario: excluye VENDIDO y DADO_DE_BAJA.
  @IsOptional()
  @IsIn(['true', 'false'])
  inventario?: 'true' | 'false';

  @IsOptional()
  @IsIn(OrigenVehiculo.options)
  origen?: OrigenVehiculo;

  // Solo los que tienen algo por completar (fotos, ficha, documentos, inspección).
  @IsOptional()
  @IsIn(['true', 'false'])
  pendientes?: 'true' | 'false';

  // Solo tiene efecto para ADMIN_GENERAL; los demás ya están acotados a su sucursal.
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  // Marca, modelo, versión o patente.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  // Orden de la tabla (lista cerrada; nunca se interpola texto del cliente).
  @IsOptional()
  @IsIn(ORDENES_VEHICULO)
  orden?: OrdenVehiculo;

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
