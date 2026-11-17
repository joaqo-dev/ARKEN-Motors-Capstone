import { deflateSync } from 'node:zlib';

// PNG de demostración (degradado de un color) generado sin dependencias, para
// que el seed tenga fotos reales que la API acepta (firma PNG válida).
export function pngDemo(rgb: [number, number, number], ancho = 640, alto = 400): Buffer {
  const filas: Buffer[] = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 3);
    const luz = 0.55 + 0.45 * (1 - y / alto);
    for (let x = 0; x < ancho; x++) {
      const brillo = luz * (0.85 + 0.15 * (x / ancho));
      fila[1 + x * 3] = Math.min(255, Math.round(rgb[0] * brillo));
      fila[2 + x * 3] = Math.min(255, Math.round(rgb[1] * brillo));
      fila[3 + x * 3] = Math.min(255, Math.round(rgb[2] * brillo));
    }
    filas.push(fila);
  }
  const chunk = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(filas))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
