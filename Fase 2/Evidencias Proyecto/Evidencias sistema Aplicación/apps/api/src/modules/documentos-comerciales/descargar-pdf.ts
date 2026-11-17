import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';

// Respuesta HTTP común para descargar el PDF privado de un documento.
export function descargarPdf(
  res: Response,
  archivo: { ruta: string; mime: string },
  nombre: string,
): StreamableFile {
  res.set({
    'Content-Type': archivo.mime,
    'Content-Disposition': `inline; filename="${nombre}"`,
    'Cache-Control': 'private, no-store',
  });
  return new StreamableFile(createReadStream(archivo.ruta));
}
