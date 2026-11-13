import { IsUUID } from 'class-validator';

export class TransferirVehiculoDto {
  @IsUUID()
  sucursalDestinoId!: string;
}
