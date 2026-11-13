import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimONull } from '../vehiculos/dto/transforms';
import { ORDENES_DOCUMENTOS, type OrdenDocumentos } from './filtros';

// DTOs compartidos por Cotización, Reserva y Tasación.

export class MotivoObligatorioDto {
  // class-validator informa los errores en orden inverso a la declaración:
  // el largo máximo va primero para que "obligatorio" encabece la respuesta.
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @IsString({ message: 'El motivo es obligatorio' })
  @Transform(trimONull)
  motivo!: string;
}

export class NuevaFechaVencimientoDto {
  @IsDateString({ strict: true })
  nuevaFechaVencimiento!: string;
}

export class ResolverOfertaDto {
  @IsIn(['ACEPTADA', 'RECHAZADA'])
  estado!: 'ACEPTADA' | 'RECHAZADA';
}

export class ListarDocumentosDto {
  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  vehiculoId?: string;

  // Solo tiene efecto para ADMIN_GENERAL.
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  // Búsqueda libre: folio, cliente (nombre o RUT), patente, marca o modelo.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(ORDENES_DOCUMENTOS)
  orden?: OrdenDocumentos;

  // Rango de fecha de emisión.
  @IsOptional()
  @IsDateString({ strict: true })
  desde?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  hasta?: string;

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

// Casilla "Enviar por correo al cliente". Si no viene, decide la
// configuración de la automotora.
export class EnvioCorreoDto {
  @IsOptional()
  @IsBoolean()
  enviarCorreo?: boolean;
}

// Al emitir: vigencia en días (por defecto, la de la automotora) y envío por correo.
export class EmisionDocumentoDto extends EnvioCorreoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  vigenciaDias?: number;
}
