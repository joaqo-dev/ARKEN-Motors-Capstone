import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { AlmacenamientoService } from './almacenamiento.service';

describe('AlmacenamientoService.guardarFoto (webp)', () => {
  let raiz: string;
  let servicio: AlmacenamientoService;

  beforeAll(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'vitriauto-fotos-'));
    servicio = new AlmacenamientoService({ UPLOADS_DIR: raiz } as never);
  });
  afterAll(() => rm(raiz, { recursive: true, force: true }));

  const leer = async (url: string) =>
    readFile(join(raiz, 'fotos', url.replace('/archivos/fotos/', '')));

  it('convierte a webp, acota el lado mayor y no agranda las chicas', async () => {
    const grande = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#c33' },
    })
      .jpeg()
      .toBuffer();
    const url = await servicio.guardarFoto(servicio.validarFoto(grande));
    expect(url).toMatch(/^\/archivos\/fotos\/[0-9a-f-]+\.webp$/);
    const meta = await sharp(await leer(url)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 2000, 1000]);

    const chica = await sharp({
      create: { width: 300, height: 200, channels: 4, background: '#0000' },
    })
      .png()
      .toBuffer();
    const urlChica = await servicio.guardarFoto(servicio.validarFoto(chica), 512);
    const metaChica = await sharp(await leer(urlChica)).metadata();
    expect([metaChica.width, metaChica.hasAlpha]).toEqual([300, true]); // conserva transparencia
  });

  it('endereza según la orientación EXIF y quita los metadatos', async () => {
    // Foto "girada" del celular: 400x200 con orientación 6 (rotar 90°).
    const girada = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#36c' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const url = await servicio.guardarFoto(servicio.validarFoto(girada));
    const meta = await sharp(await leer(url)).metadata();
    expect([meta.width, meta.height, meta.orientation, meta.exif]).toEqual([
      200,
      400,
      undefined,
      undefined,
    ]);
  });

  it('rechaza con un mensaje claro una imagen dañada', async () => {
    const rota = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
    await expect(servicio.guardarFoto(servicio.validarFoto(rota))).rejects.toThrow(
      'No pudimos procesar la imagen',
    );
  });

  it('documentos: guarda PDF/JPG/PNG tal cual y pasa AVIF a JPG', async () => {
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const clavePng = await servicio.guardarDocumento(servicio.validarDocumento(png));
    expect(clavePng).toMatch(/\.png$/);
    expect((await readFile(join(raiz, clavePng))).equals(png)).toBe(true);

    const avif = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#09f' } })
      .avif()
      .toBuffer();
    const claveAvif = await servicio.guardarDocumento(servicio.validarDocumento(avif));
    expect(claveAvif).toMatch(/^documentos\/[0-9a-f-]+\.jpg$/);
    expect((await sharp(await readFile(join(raiz, claveAvif))).metadata()).format).toBe('jpeg');
  });
});
