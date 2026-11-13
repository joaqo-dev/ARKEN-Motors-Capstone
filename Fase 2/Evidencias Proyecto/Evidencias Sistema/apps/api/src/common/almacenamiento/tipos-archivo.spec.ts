import { detectarTipoArchivo } from './tipos-archivo';

describe('detectarTipoArchivo', () => {
  it('reconoce jpg, png, webp y pdf por su firma', () => {
    expect(detectarTipoArchivo(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(detectarTipoArchivo(Buffer.from('89504e470d0a1a0a00', 'hex'))).toBe('png');
    expect(detectarTipoArchivo(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))).toBe('webp');
    expect(detectarTipoArchivo(Buffer.from('%PDF-1.7\n'))).toBe('pdf');
  });

  it('reconoce HEIC (iPhone) y AVIF por la marca de su contenedor', () => {
    const contenedor = (marca: string) => Buffer.from(`\0\0\0\x18ftyp${marca}\0\0\0\0`, 'binary');
    expect(detectarTipoArchivo(contenedor('heic'))).toBe('heic');
    expect(detectarTipoArchivo(contenedor('mif1'))).toBe('heic');
    expect(detectarTipoArchivo(contenedor('avif'))).toBe('avif');
    expect(detectarTipoArchivo(contenedor('isom'))).toBeNull(); // un MP4 no es una foto
  });

  it('rechaza cualquier otra cosa aunque traiga extensión de imagen', () => {
    expect(detectarTipoArchivo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectarTipoArchivo(Buffer.from('MZ\x90\0'))).toBeNull();
    expect(detectarTipoArchivo(Buffer.alloc(0))).toBeNull();
  });
});
