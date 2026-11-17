import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import QRCode from 'qrcode';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import { formatearCLP } from '../../common/fechas';
import { PdfService } from '../../common/pdf/pdf.service';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { AutomotorasRepository } from '../automotoras/automotoras.repository';
import { VehiculosRepository } from '../vehiculos/vehiculos.repository';
import { plantillaFicha } from './plantilla-ficha';

const ETIQUETA: Record<string, string> = {
  MANUAL: 'Manual',
  AUTOMATICA: 'Automática',
  BENCINA: 'Bencina',
  DIESEL: 'Diésel',
  HIBRIDO: 'Híbrido',
  ELECTRICO: 'Eléctrico',
  GAS: 'Gas',
  OTRO: 'Otro',
  SUV: 'SUV',
  SEDAN: 'Sedán',
  HATCHBACK: 'Hatchback',
  CAMIONETA: 'Camioneta',
  CAMION: 'Camión',
  MOTO: 'Moto',
  X4X2: '4x2',
  X4X4: '4x4',
  AWD: 'AWD',
};
const etiqueta = (v: string) => ETIQUETA[v] ?? v;
const km = (n: number) => `${new Intl.NumberFormat('es-CL').format(n)} km`;
// La ficha es una sola hoja: la descripción se recorta para no desbordarla.
const DESCRIPCION_MAXIMA = 360;

// Ficha imprimible del vehículo (Módulo 7.10). Se genera al momento para
// mostrar siempre el precio vigente; no se guarda.
@Injectable()
export class FichasService {
  constructor(
    private readonly vehiculos: VehiculosRepository,
    private readonly automotoras: AutomotorasRepository,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly pdf: PdfService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async generar(vehiculoId: string, actor: UsuarioAutenticado) {
    const v = await this.vehiculos.findByIdScoped(vehiculoId, getScope(actor));
    if (!v) throw new NotFoundException('Vehículo no encontrado');
    if (v.estado === 'VENDIDO' || v.estado === 'DADO_DE_BAJA') {
      throw new ConflictException('La ficha es solo para vehículos en inventario');
    }
    const a = (await this.automotoras.findById(v.automotora_id))!;

    const sitio = new URL(this.config.SITIO_URL);
    const vitrina = `${a.subdominio}.${sitio.host}`;
    // QR a la página pública del vehículo: solo si está publicado.
    const qr =
      v.estado === 'DISPONIBLE'
        ? await QRCode.toBuffer(`${sitio.origin}/vehiculos/${v.id}`, {
            type: 'png',
            width: 480,
            margin: 1,
            errorCorrectionLevel: 'M',
          })
        : null;

    const logo = a.logo_url ? await this.almacenamiento.fotoParaPdf(a.logo_url, 256) : null;
    const descripcion = v.descripcion?.replace(/\s+/g, ' ').trim() || null;
    const datos = [
      { etiqueta: 'Kilometraje', valor: km(v.kilometraje) },
      { etiqueta: 'Año', valor: String(v.anio) },
      { etiqueta: 'Transmisión', valor: etiqueta(v.transmision) },
      { etiqueta: 'Combustible', valor: etiqueta(v.combustible) },
      { etiqueta: 'Tipo', valor: etiqueta(v.categoria) },
      ...(v.traccion ? [{ etiqueta: 'Tracción', valor: etiqueta(v.traccion) }] : []),
      ...(v.cilindrada ? [{ etiqueta: 'Cilindrada', valor: v.cilindrada }] : []),
      { etiqueta: 'Color', valor: v.color },
    ];

    const buffer = await this.pdf.renderizarCon((rp) =>
      plantillaFicha(rp, {
        automotora: a.nombre,
        logo,
        vitrina,
        titulo: `${v.marca} ${v.modelo}`,
        subtitulo: [v.version, String(v.anio)].filter(Boolean).join(' · '),
        precio: formatearCLP(Number(v.precio_venta)),
        datos,
        descripcion:
          descripcion && descripcion.length > DESCRIPCION_MAXIMA
            ? `${descripcion.slice(0, descripcion.lastIndexOf(' ', DESCRIPCION_MAXIMA))}…`
            : descripcion,
        qr,
      }),
    );
    return {
      buffer,
      nombre: `ficha-${v.marca}-${v.modelo}-${v.anio}.pdf`.toLowerCase().replace(/\s+/g, '-'),
    };
  }
}
