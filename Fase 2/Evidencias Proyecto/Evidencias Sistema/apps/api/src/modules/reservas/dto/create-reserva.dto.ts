import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EmisionDocumentoDto } from '../../documentos-comerciales/dto-comunes';
import { MONTO_MAXIMO, trimONull } from '../../vehiculos/dto/transforms';

export class CreateReservaDto extends EmisionDocumentoDto {
  @IsUUID()
  vehiculoId!: string;

  @IsUUID()
  clienteId!: string;

  // Seña: se descuenta del precio final si la reserva se concreta en venta.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  montoReserva!: number;

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  condicionesDevolucion?: string | null;
}
