import { RolUsuario } from '@vitriauto/shared-types';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateUsuarioDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsIn(RolUsuario.options)
  rol?: RolUsuario;

  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsUUID()
  sucursalId?: string | null;
}
