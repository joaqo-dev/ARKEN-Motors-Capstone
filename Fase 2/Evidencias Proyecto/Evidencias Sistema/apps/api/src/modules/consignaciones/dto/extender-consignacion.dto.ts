import { IsDateString } from 'class-validator';

export class ExtenderConsignacionDto {
  @IsDateString({ strict: true })
  nuevaFechaFin!: string;
}
