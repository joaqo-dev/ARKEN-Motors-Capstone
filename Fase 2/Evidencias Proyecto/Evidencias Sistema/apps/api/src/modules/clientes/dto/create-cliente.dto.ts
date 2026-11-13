import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trim, trimLower } from '../../auth/dto/transforms';

export class CreateClienteDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nombre!: string;

  // El dígito verificador se valida y el formato se normaliza en el Service.
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  rut!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefono!: string;

  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccion!: string;
}
