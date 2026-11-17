import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReordenarFotosDto {
  // Todas las fotos del vehículo, en el nuevo orden (la primera es la portada).
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  fotoIds!: string[];
}
