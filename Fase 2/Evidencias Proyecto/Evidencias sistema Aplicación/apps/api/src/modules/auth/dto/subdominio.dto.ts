import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { trimLower } from './transforms';

export class SubdominioQueryDto {
  @Transform(trimLower)
  @IsString()
  @MaxLength(63)
  subdominio!: string;
}
