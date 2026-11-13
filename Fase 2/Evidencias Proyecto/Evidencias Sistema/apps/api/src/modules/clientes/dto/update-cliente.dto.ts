import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trim, trimLower } from '../../auth/dto/transforms';

export class UpdateClienteDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nombre?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  rut?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefono?: string;

  @Transform(trimLower)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccion?: string;

  // Recordatorios y seguimientos por correo. El cliente se da de baja desde el
  // correo; aquí se puede reactivar o desactivar a pedido.
  @IsOptional()
  @IsBoolean()
  aceptaRecordatorios?: boolean;
}
