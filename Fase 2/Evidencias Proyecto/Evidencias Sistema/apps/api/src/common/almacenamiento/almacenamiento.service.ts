import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import heicConvert from 'heic-convert';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { detectarTipoArchivo, MIME_POR_TIPO, TipoArchivo } from './tipos-archivo';

// Prefijo público con que se sirven las fotos (Nest en desarrollo, Caddy en producción).
export const PREFIJO_FOTOS_PUBLICAS = '/archivos/fotos/';

// Se aceptan los formatos de cámara y celular; todas se guardan como webp.
const TIPOS_FOTO: TipoArchivo[] = ['jpg', 'png', 'webp', 'heic', 'avif'];

// Lado mayor por defecto de una foto publicada (suficiente para pantalla completa).
export const LADO_MAXIMO_FOTO = 2000;
// Documentos (boletas, documentos legales): HEIC/AVIF se guardan como JPG para
// abrirlos en cualquier navegador.
const TIPOS_DOCUMENTO: TipoArchivo[] = ['pdf', 'jpg', 'png', 'heic', 'avif'];

export interface ArchivoValidado {
  buffer: Buffer;
  tipo: TipoArchivo;
}

// Único lugar que toca el disco. Fotos: públicas. Documentos: privados, solo
// se entregan por un endpoint autenticado y con scope.

// Cubre las fotos de 48 MP del iPhone (8064×6048).
const MAX_PIXELES_HEIC = 50_000_000;
@Injectable()
export class AlmacenamientoService {
  private readonly logger = new Logger(AlmacenamientoService.name);
  readonly raiz: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.raiz = isAbsolute(config.UPLOADS_DIR) ? config.UPLOADS_DIR : resolve(config.UPLOADS_DIR);
  }

  get directorioFotos(): string {
    return join(this.raiz, 'fotos');
  }

  validarFoto(buffer: Buffer): ArchivoValidado {
    return this.validar(
      buffer,
      TIPOS_FOTO,
      'Formato de foto no permitido (usa JPG, PNG, WEBP o HEIC de iPhone)',
    );
  }

  validarDocumento(buffer: Buffer): ArchivoValidado {
    return this.validar(
      buffer,
      TIPOS_DOCUMENTO,
      'Formato de documento no permitido (usa PDF, JPG, PNG o HEIC de iPhone)',
    );
  }

  // Guarda la foto como webp y devuelve su URL pública: la endereza según su
  // EXIF, acota el lado mayor a `ladoMaximo` y quita metadatos (GPS incluido).
  async guardarFoto(archivo: ArchivoValidado, ladoMaximo = LADO_MAXIMO_FOTO): Promise<string> {
    const webp = await this.aWebp(archivo, ladoMaximo);
    const nombre = await this.escribir('fotos', { buffer: webp, tipo: 'webp' });
    return `${PREFIJO_FOTOS_PUBLICAS}${nombre}`;
  }

  // Lee una foto pública (por su URL) como JPG para incrustarla en un PDF
  // (react-pdf no lee WEBP). null si no existe o no se puede leer.
  async fotoParaPdf(url: string, ladoMaximo = 1200): Promise<Buffer | null> {
    if (!url.startsWith(PREFIJO_FOTOS_PUBLICAS)) return null;
    const ruta = resolve(this.directorioFotos, url.slice(PREFIJO_FOTOS_PUBLICAS.length));
    if (!ruta.startsWith(this.directorioFotos + sep)) return null;
    try {
      return await sharp(ruta)
        .resize({ width: ladoMaximo, height: ladoMaximo, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch (err) {
      this.logger.warn(`No se pudo leer ${url} para un PDF: ${(err as Error).message}`);
      return null;
    }
  }

  // Devuelve la clave interna del documento (no es una URL pública). PDF, JPG
  // y PNG se guardan tal cual; HEIC/AVIF pasan a JPG (derecho y sin metadatos).
  async guardarDocumento(archivo: ArchivoValidado): Promise<string> {
    const final: ArchivoValidado =
      archivo.tipo === 'heic' || archivo.tipo === 'avif'
        ? {
            buffer: await this.convertir(archivo, (img) =>
              img.rotate().jpeg({ quality: 85, mozjpeg: true }),
            ),
            tipo: 'jpg',
          }
        : archivo;
    const nombre = await this.escribir('documentos', final);
    return `documentos/${nombre}`;
  }

  rutaDocumento(clave: string): { ruta: string; mime: string } {
    const ruta = resolve(this.raiz, clave);
    if (!clave.startsWith('documentos/') || !ruta.startsWith(this.raiz + sep)) {
      throw new BadRequestException('Archivo inválido');
    }
    const extension = clave.split('.').pop() as TipoArchivo;
    return { ruta, mime: MIME_POR_TIPO[extension] ?? 'application/octet-stream' };
  }

  // Acepta la URL pública de una foto o la clave de un documento. Nunca lanza:
  // un archivo huérfano no debe hacer fallar la operación de negocio.
  async eliminar(urlOClave: string): Promise<void> {
    const relativa = urlOClave.startsWith(PREFIJO_FOTOS_PUBLICAS)
      ? `fotos/${urlOClave.slice(PREFIJO_FOTOS_PUBLICAS.length)}`
      : urlOClave;
    const ruta = resolve(this.raiz, relativa);
    if (!ruta.startsWith(this.raiz + sep)) return;
    try {
      await unlink(ruta);
    } catch (err) {
      this.logger.warn(`No se pudo eliminar ${relativa}: ${(err as Error).message}`);
    }
  }

  private aWebp(archivo: ArchivoValidado, ladoMaximo: number): Promise<Buffer> {
    return this.convertir(archivo, (img) =>
      img
        .rotate()
        .resize({ width: ladoMaximo, height: ladoMaximo, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 }),
    );
  }

  // Decodifica la imagen y aplica `procesar`. sharp no guarda metadatos salvo
  // que se le pida, así que el resultado sale sin EXIF (ni GPS).
  private async convertir(
    archivo: ArchivoValidado,
    procesar: (imagen: Sharp) => Sharp,
  ): Promise<Buffer> {
    // Tope antes de decodificar: un HEIC de pocos KB puede declarar 8192×8192 y
    // heic-convert lo decodificaría entero (~1 GB, ~1 s). sharp lee las
    // dimensiones del encabezado sin decodificar.
    if (archivo.tipo === 'heic') {
      const { width = 0, height = 0 } = await sharp(archivo.buffer)
        .metadata()
        .catch(() => ({ width: 0, height: 0 }));
      if (!width || !height || width * height > MAX_PIXELES_HEIC) {
        throw new BadRequestException(
          'La imagen es demasiado grande o está dañada. Prueba con otra o expórtala como JPG.',
        );
      }
    }
    try {
      // sharp no trae el decodificador HEVC del iPhone: el HEIC pasa primero a JPEG
      // (libheif ya aplica su rotación).
      const entrada =
        archivo.tipo === 'heic'
          ? Buffer.from(
              await heicConvert({ buffer: archivo.buffer, format: 'JPEG', quality: 0.92 }),
            )
          : archivo.buffer;
      return await procesar(sharp(entrada, { failOn: 'error' })).toBuffer();
    } catch (err) {
      this.logger.warn(
        `No se pudo convertir una imagen ${archivo.tipo}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        'No pudimos procesar la imagen: puede estar dañada. Prueba con otra o expórtala como JPG.',
      );
    }
  }

  private validar(buffer: Buffer, permitidos: TipoArchivo[], mensaje: string): ArchivoValidado {
    const tipo = detectarTipoArchivo(buffer);
    if (!tipo || !permitidos.includes(tipo)) throw new BadRequestException(mensaje);
    return { buffer, tipo };
  }

  private async escribir(
    carpeta: 'fotos' | 'documentos',
    archivo: ArchivoValidado,
  ): Promise<string> {
    const directorio = join(this.raiz, carpeta);
    await mkdir(directorio, { recursive: true });
    const nombre = `${randomUUID()}.${archivo.tipo}`;
    await writeFile(join(directorio, nombre), archivo.buffer, { flag: 'wx' });
    return nombre;
  }
}
