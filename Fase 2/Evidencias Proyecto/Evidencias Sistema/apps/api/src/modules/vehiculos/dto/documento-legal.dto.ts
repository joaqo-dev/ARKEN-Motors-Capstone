import { RespaldoDocumentoLegal, TipoDocumentoLegal } from '@vitriauto/shared-types';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

// Campos de texto del multipart que acompañan al archivo. Las reglas de cada
// respaldo (qué fechas son posibles) las aplica el servicio.
export class SubirDocumentoLegalDto {
  @IsIn(TipoDocumentoLegal.options)
  tipo!: TipoDocumentoLegal;

  @IsIn(RespaldoDocumentoLegal.options)
  respaldo!: RespaldoDocumentoLegal;

  // No va en la homologación: ahí el vencimiento se calcula.
  @IsOptional()
  @IsDateString({ strict: true })
  fechaVencimiento?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  fechaPrimeraInscripcion?: string;
}
