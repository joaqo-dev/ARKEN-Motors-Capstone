import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import type { CategoriaGasto } from '../gastos.repository';
import { CATEGORIAS_GASTO, CreateGastoDto } from './create-gasto.dto';

// La categoría debe corresponder al tipo del gasto (se valida en el Service).
export class UpdateGastoDto extends PartialType(CreateGastoDto) {
  @IsOptional()
  @IsIn(CATEGORIAS_GASTO)
  declare categoria?: CategoriaGasto;
}
