import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { DatosGeneralesVehiculoDto } from './create-vehiculo.dto';
import { MONTO_MAXIMO } from './transforms';

export class UpdateVehiculoDto extends PartialType(DatosGeneralesVehiculoDto) {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  precioVenta?: number;

  // Solo admins; nunca en vehículos consignados (costo = 0 por regla de negocio).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MONTO_MAXIMO)
  costoAdquisicion?: number;
}
