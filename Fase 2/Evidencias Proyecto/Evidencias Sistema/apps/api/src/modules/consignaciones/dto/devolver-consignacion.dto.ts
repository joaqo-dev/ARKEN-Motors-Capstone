import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trimONull } from '../../vehiculos/dto/transforms';

export class DevolverConsignacionDto {
  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string | null;
}
