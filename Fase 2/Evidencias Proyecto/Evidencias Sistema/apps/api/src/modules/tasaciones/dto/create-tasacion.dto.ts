import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EmisionDocumentoDto } from '../../documentos-comerciales/dto-comunes';
import { MONTO_MAXIMO, nombreVehiculo, trim, trimONull } from '../../vehiculos/dto/transforms';

// Datos del auto del cliente: no crea un registro en vehiculos.
export class CreateTasacionDto extends EmisionDocumentoDto {
  @IsUUID()
  clienteId!: string;

  // Obligatoria para ADMIN_GENERAL; para los demás se usa la propia (JWT).
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  // Formato validado y normalizado en el Service.
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  patente!: string;

  @Transform(nombreVehiculo)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  marca!: string;

  @Transform(nombreVehiculo)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  modelo!: string;

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string | null;

  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  anio!: number;

  @IsInt()
  @Min(0)
  @Max(5_000_000)
  kilometraje!: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  estadoGeneral!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  ofertaMonto!: number;
}
