import { Global, Module } from '@nestjs/common';
import { PdfService } from '../../common/pdf/pdf.service';
import { DocumentosPdfRepository } from './documentos-pdf.repository';
import { DocumentosPdfService } from './documentos-pdf.service';

@Global()
@Module({
  providers: [PdfService, DocumentosPdfRepository, DocumentosPdfService],
  exports: [DocumentosPdfService],
})
export class DocumentosPdfModule {}
