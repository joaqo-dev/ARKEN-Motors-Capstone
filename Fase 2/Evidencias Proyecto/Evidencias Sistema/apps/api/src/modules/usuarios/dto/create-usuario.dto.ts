import { RolUsuario } from '@vitriauto/shared-types';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(RolUsuario.options)
  rol!: RolUsuario;

  // Sucursal a la que se asigna el nuevo usuario (obligatoria si rol ≠ ADMIN_GENERAL).
  // No define el scope de quien hace la request: eso sale siempre del JWT.
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}
