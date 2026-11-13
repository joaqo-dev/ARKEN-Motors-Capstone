import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const EVENTOS = [
  'LOGIN_EXITOSO',
  'LOGIN_FALLIDO',
  'LOGOUT',
  'REGISTRO_AUTOMOTORA',
  'EMAIL_VERIFICADO',
  'INVITACION_ACEPTADA',
  'RESET_SOLICITADO',
  'PASSWORD_RESTABLECIDO',
];

export class ListarAccesosDto {
  @IsOptional()
  @IsDateString({ strict: true })
  desde?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  hasta?: string;

  @IsOptional()
  @IsIn(EVENTOS)
  evento?: string;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
