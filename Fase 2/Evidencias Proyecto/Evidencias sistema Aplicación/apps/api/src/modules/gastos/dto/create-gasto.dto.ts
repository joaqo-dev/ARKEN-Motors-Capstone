import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MONTO_MAXIMO, trimONull } from '../../vehiculos/dto/transforms';
import {
  CATEGORIAS_OPERACIONAL,
  CATEGORIAS_VEHICULO,
  type CategoriaGasto,
} from '../gastos.repository';

export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  ...CATEGORIAS_VEHICULO,
  ...CATEGORIAS_OPERACIONAL,
];

// Gasto de un vehículo. Se recibe como JSON o como multipart (con la boleta en
// el campo "adjunto"): en multipart los números llegan como texto, de ahí el @Type.
export class CreateGastoDto {
  @IsIn(CATEGORIAS_VEHICULO)
  categoria!: CategoriaGasto;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  monto!: number;

  @IsDateString({ strict: true })
  fecha!: string;

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string | null;
}

// Gasto operacional (arriendo, sueldos...): sin vehículo. sucursalId vacío o
// ausente = gasto general de la automotora (solo ADMIN_GENERAL).
export class CreateGastoOperacionalDto {
  @IsIn(CATEGORIAS_OPERACIONAL)
  categoria!: CategoriaGasto;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  monto!: number;

  @IsDateString({ strict: true })
  fecha!: string;

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string | null;

  @Transform(({ value }) => (value === '' || value === 'null' ? null : value))
  @IsOptional()
  @IsUUID()
  sucursalId?: string | null;
}
