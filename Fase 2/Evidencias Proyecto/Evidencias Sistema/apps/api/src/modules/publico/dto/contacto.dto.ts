import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim, trimONull } from '../../vehiculos/dto/transforms';

// Formulario de contacto del perfil público (Módulo 3): llega por correo a la automotora.
export class ContactoAutomotoraDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @Transform(trim)
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  @MaxLength(200)
  email!: string;

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  // Sucursal por la que consulta (opcional; debe ser de la automotora).
  @Transform(trimONull)
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'El mensaje debe tener al menos 10 caracteres' })
  @MaxLength(2000)
  mensaje!: string;

  // Trampa para bots (campo oculto): si viene con algo, se descarta en silencio.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sitioWeb?: string;
}
