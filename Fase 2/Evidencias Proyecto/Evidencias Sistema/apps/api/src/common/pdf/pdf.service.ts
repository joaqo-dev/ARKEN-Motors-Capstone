import { Injectable } from '@nestjs/common';
import type { ReactElement } from 'react';
import type * as ReactPdf from '@react-pdf/renderer';
import type { DocumentoPdf } from './documento-pdf';
import { plantillaDocumento } from './plantilla-documento';

// import() nativo: con module CommonJS, TypeScript lo convertiría en require(),
// que no puede cargar un paquete ESM-only como @react-pdf/renderer.
const importarEsm = new Function('modulo', 'return import(modulo)') as (
  modulo: string,
) => Promise<typeof ReactPdf>;

@Injectable()
export class PdfService {
  private reactPdf: Promise<typeof ReactPdf> | null = null;

  async renderizar(doc: DocumentoPdf): Promise<Buffer> {
    return this.renderizarCon((rp) => plantillaDocumento(rp, doc));
  }

  // Para plantillas propias (ficha del vehículo, informe de inspección): la
  // función recibe el módulo de react-pdf ya cargado y arma el documento.
  async renderizarCon(construir: (rp: typeof ReactPdf) => ReactElement): Promise<Buffer> {
    this.reactPdf ??= importarEsm('@react-pdf/renderer');
    const rp = await this.reactPdf;
    return rp.renderToBuffer(construir(rp) as Parameters<typeof rp.renderToBuffer>[0]);
  }
}
