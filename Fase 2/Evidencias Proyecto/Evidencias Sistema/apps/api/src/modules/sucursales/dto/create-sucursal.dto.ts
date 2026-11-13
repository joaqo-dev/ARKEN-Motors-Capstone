import { RegionChile } from '@vitriauto/shared-types';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateSucursalDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccion!: string;

  @IsIn(RegionChile.options)
  region!: RegionChile;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  comuna!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefono!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  encargado?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  horarioAtencion?: string;

  // Celular para WhatsApp (+569XXXXXXXX); se normaliza y valida en el Service.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string;
}
