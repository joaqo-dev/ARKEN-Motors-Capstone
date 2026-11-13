import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ConsultaDashboardDto {
  // Período: por defecto, el mes actual (hasta hoy).
  @IsOptional()
  @IsDateString({ strict: true })
  desde?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  hasta?: string;

  // Filtro por una o varias sucursales: solo ADMIN_GENERAL. Sin él, consolidado.
  // Acepta ?sucursalIds=a&sucursalIds=b o ?sucursalIds=a,b
  @Transform(({ value }) =>
    value === undefined
      ? undefined
      : (Array.isArray(value) ? value : String(value).split(',')).filter(Boolean),
  )
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  sucursalIds?: string[];
}
