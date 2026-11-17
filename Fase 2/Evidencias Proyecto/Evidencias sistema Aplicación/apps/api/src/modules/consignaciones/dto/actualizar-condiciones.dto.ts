import { TipoTrato } from '@vitriauto/shared-types';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { MONTO_MAXIMO } from '../../vehiculos/dto/transforms';

// Condiciones del trato, modificables durante la vigencia (Módulo 9). Lo que no
// se envía se mantiene; al cambiar de tipo se exige el dato del nuevo tipo.
export class ActualizarCondicionesDto {
  @IsOptional()
  @IsIn(TipoTrato.options)
  tipoTrato?: TipoTrato;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(100)
  porcentajeComision?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  montoNeto?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  precioMinimo?: number;
}
