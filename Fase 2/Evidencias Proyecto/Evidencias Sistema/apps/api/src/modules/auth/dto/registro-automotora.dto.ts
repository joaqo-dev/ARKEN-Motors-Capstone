import { RegionChile } from '@vitriauto/shared-types';
import { PASSWORD_REGEX } from '@vitriauto/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MENSAJE_PASSWORD, trim, trimLower } from './transforms';

export class DatosAutomotoraDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  // El dígito verificador se valida en el Service (regla de negocio).
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  rut!: string;

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

  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trimLower)
  @IsString()
  @IsNotEmpty()
  @MaxLength(63)
  subdominio!: string;
}

export class DatosAdminDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(PASSWORD_REGEX, { message: MENSAJE_PASSWORD })
  password!: string;
}

export class RegistroAutomotoraDto {
  @ValidateNested()
  @Type(() => DatosAutomotoraDto)
  automotora!: DatosAutomotoraDto;

  @ValidateNested()
  @Type(() => DatosAdminDto)
  admin!: DatosAdminDto;

  // Obligatorio: acepta los Términos de uso y la Política de privacidad vigentes.
  @Equals(true, { message: 'Debes aceptar los Términos de uso y la Política de privacidad' })
  aceptaTerminos!: boolean;
}
