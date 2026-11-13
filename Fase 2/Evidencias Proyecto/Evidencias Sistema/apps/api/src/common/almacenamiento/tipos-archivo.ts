// Detecta el tipo real de un archivo por su firma de bytes, no por la
// extensión ni el Content-Type del cliente.
// heic/avif: formatos de celular que se aceptan como foto y se convierten a webp.
export type TipoArchivo = 'jpg' | 'png' | 'webp' | 'pdf' | 'heic' | 'avif';

export const MIME_POR_TIPO: Record<TipoArchivo, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  heic: 'image/heic',
  avif: 'image/avif',
};

// Contenedor ISO-BMFF ("....ftyp<marca>"): la marca dice si es HEIC (iPhone) o AVIF.
const MARCAS_HEIC = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];
const MARCAS_AVIF = ['avif', 'avis'];

export function detectarTipoArchivo(buffer: Buffer): TipoArchivo | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const marca = buffer.subarray(8, 12).toString('ascii');
    if (MARCAS_AVIF.includes(marca)) return 'avif';
    if (MARCAS_HEIC.includes(marca)) return 'heic';
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'pdf';
  }
  return null;
}
