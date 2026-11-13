import {
  EVALUACIONES_INSPECCION,
  RESULTADOS_INSPECCION,
  SECCIONES_INSPECCION,
  type EvaluacionInspeccion,
  type ResultadoInspeccion,
} from '@vitriauto/shared-types';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { trim } from '../../vehiculos/dto/transforms';

export class ActualizarInspeccionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5_000_000)
  kilometraje?: number;

  // Observaciones generales (públicas); null las quita.
  @Transform(trim)
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string | null;
}

export class ActualizarPuntoDto {
  // null = vuelve a "sin evaluar".
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsIn(EVALUACIONES_INSPECCION)
  evaluacion?: EvaluacionInspeccion | null;

  @Transform(trim)
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string | null;

  @Transform(trim)
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notaInterna?: string | null;

  // Solo puntos agregados en la inspección (lo valida el Service).
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nombre?: string;
}

export class AgregarPuntoDto {
  @IsIn(SECCIONES_INSPECCION.map((s) => s.codigo))
  seccion!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escribe qué se revisa en este punto' })
  @MaxLength(160)
  nombre!: string;
}

export class FinalizarInspeccionDto {
  @IsIn(RESULTADOS_INSPECCION)
  resultado!: ResultadoInspeccion;
}
