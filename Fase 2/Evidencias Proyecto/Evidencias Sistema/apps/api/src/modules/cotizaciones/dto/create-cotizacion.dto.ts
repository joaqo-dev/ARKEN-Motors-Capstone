import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EmisionDocumentoDto } from '../../documentos-comerciales/dto-comunes';
import { MONTO_MAXIMO, trim } from '../../vehiculos/dto/transforms';

export class CostoAdicionalDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  descripcion!: string;

  // $0 permitido: sirve para dejar registrado algo de regalo.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MONTO_MAXIMO)
  monto!: number;
}

export class CreateCotizacionDto extends EmisionDocumentoDto {
  @IsUUID()
  vehiculoId!: string;

  @IsUUID()
  clienteId!: string;

  // Puede diferir del precio de venta.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  precioCotizado!: number;

  // Adicionales (ej. traspaso): suman al total a pagar, nunca entran en márgenes.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CostoAdicionalDto)
  costosAdicionales?: CostoAdicionalDto[];
}
