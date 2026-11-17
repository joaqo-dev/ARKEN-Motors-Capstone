import { formatearRut } from '@vitriauto/shared-types';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { calcularLiquidacion } from '@vitriauto/shared-types';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import { formatearCLP } from '../../common/fechas';
import type { DocumentoPdf, FilaDato } from '../../common/pdf/documento-pdf';
import { PdfService } from '../../common/pdf/pdf.service';
import {
  DatosEncabezado,
  DatosVehiculo,
  DocumentosPdfRepository,
  TipoDocumentoComercial,
} from './documentos-pdf.repository';

const TITULO: Record<TipoDocumentoComercial, string> = {
  COTIZACION: 'Cotización',
  RESERVA: 'Reserva',
  TASACION: 'Tasación',
  CONSIGNACION: 'Consignación',
  VENTA: 'Comprobante de venta',
};

const FORMA_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  FINANCIAMIENTO: 'Financiamiento',
  PARTE_PAGO: 'Vehículo en parte de pago',
};

// PDFs de documentos comerciales. Se generan al emitir (después del COMMIT) y se
// guardan como archivo privado: reflejan los datos vigentes en ese momento. Si
// la generación falló, se reintenta en la primera descarga.
@Injectable()
export class DocumentosPdfService {
  private readonly logger = new Logger(DocumentosPdfService.name);

  constructor(
    private readonly repo: DocumentosPdfRepository,
    private readonly pdf: PdfService,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  // Nunca lanza: un PDF fallido no debe revertir la emisión del documento.
  async generarTrasEmitir(tipo: TipoDocumentoComercial, id: string): Promise<void> {
    try {
      await this.generar(tipo, id);
    } catch (err) {
      this.logger.error(`No se pudo generar el PDF de ${tipo} ${id}: ${(err as Error).message}`);
    }
  }

  // Ruta del PDF para descargarlo (el control de acceso lo hace el Service del documento).
  async ruta(tipo: TipoDocumentoComercial, id: string) {
    const clave = await this.generar(tipo, id);
    return { ...this.almacenamiento.rutaDocumento(clave), nombre: `${tipo.toLowerCase()}.pdf` };
  }

  private async generar(tipo: TipoDocumentoComercial, id: string): Promise<string> {
    const { documento, pdfUrl } = await this.construir(tipo, id);
    if (pdfUrl) return pdfUrl;

    const buffer = await this.pdf.renderizar(documento);
    const clave = await this.almacenamiento.guardarDocumento({ buffer, tipo: 'pdf' });
    if (!(await this.repo.fijarPdf(tipo, id, clave))) {
      // Otra request lo generó al mismo tiempo: se conserva el primero.
      await this.almacenamiento.eliminar(clave);
      return (await this.construir(tipo, id)).pdfUrl!;
    }
    return clave;
  }

  private async construir(
    tipo: TipoDocumentoComercial,
    id: string,
  ): Promise<{ documento: DocumentoPdf; pdfUrl: string | null }> {
    switch (tipo) {
      case 'COTIZACION': {
        const d = await this.repo.cotizacion(id);
        if (!d) throw new NotFoundException('Cotización no encontrada');
        const precio = Number(d.precio_cotizado);
        const adicionales = d.costos.map((c) => ({
          descripcion: c.descripcion,
          monto: Number(c.monto),
        }));
        return {
          pdfUrl: d.pdf_url,
          documento: this.base(tipo, d, {
            fechas: [
              { etiqueta: 'Emisión', valor: fechaHora(d.fecha_emision) },
              { etiqueta: 'Válida hasta', valor: fecha(d.fecha_vencimiento) },
            ],
            secciones: [this.cliente(d), this.vehiculo(d)],
            montos: {
              titulo: 'Detalle',
              filas: [
                { descripcion: 'Precio del vehículo', monto: formatearCLP(precio) },
                ...adicionales.map((c) => ({
                  descripcion: c.descripcion,
                  monto: montoAdicional(c.monto),
                })),
              ],
              total: {
                etiqueta: 'Total a pagar',
                monto: formatearCLP(precio + adicionales.reduce((suma, c) => suma + c.monto, 0)),
              },
            },
            notas: [
              `Cotización válida por ${d.vigencia_dias} día(s), hasta el ${fecha(d.fecha_vencimiento)}.`,
              'Los adicionales (ej. traspaso) se suman al total a pagar.',
              'Esta cotización no constituye reserva del vehículo.',
            ],
          }),
        };
      }
      case 'RESERVA': {
        const d = await this.repo.reserva(id);
        if (!d) throw new NotFoundException('Reserva no encontrada');
        const monto = Number(d.monto_reserva);
        const precio = Number(d.vehiculo_precio_venta);
        return {
          pdfUrl: d.pdf_url,
          documento: this.base(tipo, d, {
            fechas: [
              { etiqueta: 'Emisión', valor: fechaHora(d.fecha_emision) },
              { etiqueta: 'Vigente hasta', valor: fecha(d.fecha_vencimiento) },
            ],
            secciones: [this.cliente(d), this.vehiculo(d)],
            montos: {
              titulo: 'Reserva',
              filas: [
                { descripcion: 'Precio de venta del vehículo', monto: formatearCLP(precio) },
                { descripcion: 'Monto de la reserva (seña)', monto: formatearCLP(monto) },
              ],
              total: {
                etiqueta: 'Saldo a pagar al concretar la venta',
                monto: formatearCLP(precio - monto),
              },
            },
            notas: [
              `El vehículo queda reservado hasta el ${fecha(d.fecha_vencimiento)}.`,
              'Si la reserva se concreta en venta, su monto se descuenta del precio final.',
              ...(d.condiciones_devolucion ? [`Devolución: ${d.condiciones_devolucion}`] : []),
            ],
            firmas: ['Firma cliente', `Firma ${d.automotora_nombre}`],
          }),
        };
      }
      case 'TASACION': {
        const d = await this.repo.tasacion(id);
        if (!d) throw new NotFoundException('Tasación no encontrada');
        return {
          pdfUrl: d.pdf_url,
          documento: this.base(tipo, d, {
            fechas: [
              { etiqueta: 'Emisión', valor: fechaHora(d.fecha_emision) },
              { etiqueta: 'Oferta válida hasta', valor: fecha(d.fecha_vencimiento) },
            ],
            secciones: [
              this.cliente(d),
              {
                titulo: 'Vehículo tasado',
                filas: [
                  { etiqueta: 'Patente', valor: d.patente },
                  {
                    etiqueta: 'Marca / modelo',
                    valor: [d.marca, d.modelo, d.version].filter(Boolean).join(' '),
                  },
                  { etiqueta: 'Año', valor: String(d.anio) },
                  { etiqueta: 'Kilometraje', valor: `${d.kilometraje.toLocaleString('es-CL')} km` },
                  { etiqueta: 'Estado general', valor: d.estado_general },
                ],
              },
            ],
            montos: {
              titulo: 'Oferta de compra',
              filas: [],
              total: { etiqueta: 'Monto ofrecido', monto: formatearCLP(Number(d.oferta_monto)) },
            },
            notas: [
              `Oferta válida hasta el ${fecha(d.fecha_vencimiento)}, sujeta a revisión mecánica y documental.`,
            ],
          }),
        };
      }
      case 'VENTA': {
        const d = await this.repo.venta(id);
        if (!d) throw new NotFoundException('Venta no encontrada');
        const precio = Number(d.precio_venta_final);
        const sena = d.reserva_monto ? Number(d.reserva_monto) : 0;
        const adicionales = d.costos.reduce((suma, c) => suma + Number(c.monto), 0);
        return {
          pdfUrl: d.pdf_url,
          documento: this.base(tipo, d, {
            fechas: [{ etiqueta: 'Fecha de venta', valor: fechaHora(d.fecha_venta) }],
            secciones: [{ ...this.cliente(d), titulo: 'Comprador' }, this.vehiculo(d)],
            montos: {
              titulo: 'Pago',
              filas: [
                { descripcion: 'Precio de venta', monto: formatearCLP(precio) },
                ...d.costos.map((c) => ({
                  descripcion: c.descripcion,
                  monto: montoAdicional(Number(c.monto)),
                })),
                ...(sena
                  ? [
                      {
                        descripcion: `Seña pagada (reserva N° ${d.reserva_folio})`,
                        monto: `−${formatearCLP(sena)}`,
                      },
                    ]
                  : []),
                ...d.formas.map((f) => ({
                  descripcion: `Pago: ${FORMA_PAGO[f.tipo]}${f.patente ? ` (${f.patente})` : ''}`,
                  monto: formatearCLP(Number(f.monto)),
                })),
              ],
              total: {
                etiqueta: 'Total pagado en esta venta',
                monto: formatearCLP(precio + adicionales - sena),
              },
            },
            firmas: ['Firma comprador', `Firma ${d.automotora_nombre}`],
          }),
        };
      }
      case 'CONSIGNACION': {
        const d = await this.repo.consignacion(id);
        if (!d) throw new NotFoundException('Consignación no encontrada');
        const precio = Number(d.vehiculo_precio_venta);
        const neto = d.tipo_trato === 'PRECIO_NETO';
        const porcentaje = Number(d.porcentaje_comision);
        const liquidacion = calcularLiquidacion(
          {
            tipoTrato: d.tipo_trato,
            porcentajeComision: neto ? null : porcentaje,
            montoNeto: neto ? Number(d.monto_neto) : null,
          },
          precio,
        );
        return {
          pdfUrl: d.pdf_url,
          documento: this.base(tipo, d, {
            fechas: [
              { etiqueta: 'Emisión', valor: fechaHora(d.fecha_creacion) },
              { etiqueta: 'Plazo', valor: `${fecha(d.fecha_inicio)} al ${fecha(d.fecha_fin)}` },
            ],
            secciones: [{ ...this.cliente(d), titulo: 'Consignante' }, this.vehiculo(d)],
            montos: {
              titulo: 'Condiciones comerciales',
              filas: [
                {
                  descripcion: 'Tipo de trato',
                  monto: neto ? 'Precio neto garantizado' : 'Comisión sobre la venta',
                },
                { descripcion: 'Precio de venta', monto: formatearCLP(precio) },
                ...(neto
                  ? []
                  : [
                      {
                        descripcion: 'Precio mínimo aceptado',
                        monto: formatearCLP(Number(d.precio_minimo)),
                      },
                      {
                        descripcion: `Comisión de la automotora (${porcentaje.toLocaleString('es-CL', { maximumFractionDigits: 2 })}% del precio final de venta)`,
                        monto: formatearCLP(liquidacion.comision),
                      },
                    ]),
              ],
              total: neto
                ? {
                    etiqueta: 'Monto neto garantizado para el consignante',
                    monto: formatearCLP(liquidacion.montoConsignante),
                  }
                : {
                    etiqueta: 'Monto estimado para el consignante (al precio de venta)',
                    monto: formatearCLP(liquidacion.montoConsignante),
                  },
            },
            notas: [
              neto
                ? 'El consignante recibe el monto neto indicado; la automotora conserva la diferencia con el precio final de venta.'
                : 'La comisión se calcula sobre el precio final de venta, sin descuento de gastos.',
              'Al vencer el plazo, las partes acuerdan extenderlo o la devolución del vehículo.',
            ],
            firmas: ['Firma consignante', `Firma ${d.automotora_nombre}`],
          }),
        };
      }
    }
  }

  private base(
    tipo: TipoDocumentoComercial,
    d: DatosEncabezado,
    contenido: Omit<DocumentoPdf, 'titulo' | 'folio' | 'emisor' | 'pie'>,
  ): DocumentoPdf {
    return {
      titulo: TITULO[tipo],
      folio: d.folio,
      emisor: {
        automotora: d.automotora_nombre,
        rut: formatearRut(d.automotora_rut),
        email: d.automotora_email,
        sucursal: d.sucursal_nombre,
        direccion: d.sucursal_direccion,
        telefono: d.sucursal_telefono,
      },
      pie: `${TITULO[tipo]} N° ${d.folio} · ${d.sucursal_nombre} · Emitida por ${d.ejecutivo_nombre}`,
      ...contenido,
    };
  }

  private cliente(d: DatosEncabezado): { titulo: string; filas: FilaDato[] } {
    return {
      titulo: 'Cliente',
      filas: [
        { etiqueta: 'Nombre', valor: d.cliente_nombre },
        { etiqueta: 'RUT', valor: formatearRut(d.cliente_rut) },
        { etiqueta: 'Teléfono', valor: d.cliente_telefono },
        { etiqueta: 'Email', valor: d.cliente_email },
        { etiqueta: 'Dirección', valor: d.cliente_direccion },
      ],
    };
  }

  private vehiculo(d: DatosVehiculo): { titulo: string; filas: FilaDato[] } {
    return {
      titulo: 'Vehículo',
      filas: [
        { etiqueta: 'Patente', valor: d.vehiculo_patente },
        {
          etiqueta: 'Marca / modelo',
          valor: [d.vehiculo_marca, d.vehiculo_modelo, d.vehiculo_version]
            .filter(Boolean)
            .join(' '),
        },
        { etiqueta: 'Año', valor: String(d.vehiculo_anio) },
        { etiqueta: 'Kilometraje', valor: `${d.vehiculo_kilometraje.toLocaleString('es-CL')} km` },
        { etiqueta: 'Color', valor: d.vehiculo_color },
      ],
    };
  }
}

// 'YYYY-MM-DD' → 'DD-MM-YYYY'
// Adicional de $0 = referencia de algo sin costo (ej. de regalo).
function montoAdicional(monto: number): string {
  return monto === 0 ? 'Sin costo' : formatearCLP(monto);
}

function fecha(valor: string): string {
  const [anio, mes, dia] = valor.split('-');
  return `${dia}-${mes}-${anio}`;
}

// Fecha y hora de Chile: 'DD-MM-YYYY HH:mm'
function fechaHora(valor: Date): string {
  const partes = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(valor);
  const p = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((x) => x.type === tipo)?.value ?? '';
  return `${p('day')}-${p('month')}-${p('year')} ${p('hour')}:${p('minute')}`;
}
