import { ESTADOS_VEHICULO_MANUALES, EstadoVehiculoManual } from '@vitriauto/shared-types';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimONull } from './transforms';

export class CambiarEstadoVehiculoDto {
  @IsIn(ESTADOS_VEHICULO_MANUALES, {
    message: `estado debe ser uno de: ${ESTADOS_VEHICULO_MANUALES.join(', ')} (RESERVADO y VENDIDO se fijan desde Reservas y Ventas)`,
  })
  estado!: EstadoVehiculoManual;

  // Queda en la bitácora (ej. motivo de la baja).
  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string | null;
}
