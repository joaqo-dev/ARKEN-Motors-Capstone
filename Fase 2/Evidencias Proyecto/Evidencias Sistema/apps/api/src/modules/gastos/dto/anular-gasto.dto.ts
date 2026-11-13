import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trimONull } from '../../vehiculos/dto/transforms';

export class AnularGastoDto {
  // Queda en la auditoría.
  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string | null;
}
