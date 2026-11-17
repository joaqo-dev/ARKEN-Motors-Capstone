import { IsBoolean, IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import type { TipoDocumentoCorreo } from '../correos.repository';

const TIPOS: TipoDocumentoCorreo[] = ['COTIZACION', 'RESERVA', 'TASACION', 'VENTA', 'CONSIGNACION'];

export class DocumentoCorreoDto {
  @IsIn(TIPOS)
  documentoTipo!: TipoDocumentoCorreo;

  @IsUUID()
  documentoId!: string;
}

export class RecordatoriosDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @IsBoolean()
  acepta!: boolean;
}
