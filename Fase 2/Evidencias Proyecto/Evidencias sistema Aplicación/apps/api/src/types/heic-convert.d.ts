// heic-convert no publica tipos.
declare module 'heic-convert' {
  function convert(opciones: {
    buffer: Buffer | ArrayBufferLike;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }): Promise<ArrayBuffer>;
  export default convert;
}
