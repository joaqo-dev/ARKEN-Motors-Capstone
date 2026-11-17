import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { trimLower } from './transforms';

export class EmailDto {
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
