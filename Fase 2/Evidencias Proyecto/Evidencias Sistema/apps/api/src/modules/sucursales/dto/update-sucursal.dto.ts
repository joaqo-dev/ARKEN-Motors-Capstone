import { RegionChile } from '@vitriauto/shared-types';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { EsTelefono } from '../../../common/validacion/telefono';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateSucursalDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccion?: string;

  @IsOptional()
  @IsIn(RegionChile.options)
  region?: RegionChile;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  comuna?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @EsTelefono()
  telefono?: string;

  // null permite quitar el encargado.
  @Transform(trim)
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  encargado?: string | null;

  // null quita el horario.
  @Transform(trim)
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  horarioAtencion?: string | null;

  // null quita el WhatsApp (se usará el teléfono).
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string | null;
}
