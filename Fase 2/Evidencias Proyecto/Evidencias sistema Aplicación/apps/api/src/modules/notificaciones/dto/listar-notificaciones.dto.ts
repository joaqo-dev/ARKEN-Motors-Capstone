import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TIPOS_NOTIFICACION, type TipoNotificacion } from '../notificaciones.repository';

export class ListarNotificacionesDto {
  @IsOptional()
  @IsIn(['PENDIENTE', 'RESUELTA'])
  estado?: 'PENDIENTE' | 'RESUELTA';

  @IsOptional()
  @IsIn(TIPOS_NOTIFICACION)
  tipo?: TipoNotificacion;

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
