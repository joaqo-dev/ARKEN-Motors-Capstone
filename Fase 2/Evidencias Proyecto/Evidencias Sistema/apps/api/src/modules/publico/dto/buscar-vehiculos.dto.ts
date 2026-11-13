import { CategoriaVehiculo, RegionChile, TransmisionVehiculo } from '@vitriauto/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ORDENES = [
  'recientes',
  'precio_asc',
  'precio_desc',
  'anio_desc',
  'anio_asc',
  'km_asc',
  'km_desc',
] as const;
export type Orden = (typeof ORDENES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

// Filtros del marketplace y del perfil público de cada automotora.
export class BuscarVehiculosDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  modelo?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  anioMin?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  anioMax?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  precioMin?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  precioMax?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  kmMin?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  kmMax?: number;

  @IsOptional()
  @IsIn(CategoriaVehiculo.options)
  categoria?: string;

  @IsOptional()
  @IsIn(TransmisionVehiculo.options)
  transmision?: string;

  // Ubicación: sucursal real del vehículo.
  @IsOptional()
  @IsIn(RegionChile.options)
  region?: RegionChile;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  comuna?: string;

  // Perfil público: acota a una automotora y permite filtrar por su sucursal.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsOptional()
  @Matches(/^[a-z0-9-]{3,63}$/)
  subdominio?: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  @IsOptional()
  @IsIn(ORDENES)
  orden?: Orden;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  pagina?: number;
}

export class FiltrosDisponiblesDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsOptional()
  @Matches(/^[a-z0-9-]{3,63}$/)
  subdominio?: string;

  // Opciones dependientes: modelos de una marca, comunas de una región.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string;

  @IsOptional()
  @IsIn(RegionChile.options)
  region?: RegionChile;
}
