import { formatearTelefono } from '@vitriauto/shared-types';
import { formatearCLP, sumarDias } from '../../common/fechas';
import type { DocumentoCorreoRow, TipoCorreo, TipoDocumentoCorreo } from './correos.repository';

export interface ContenidoCorreo {
  asunto: string;
  titulo: string;
  parrafos: string[];
  resumen: { etiqueta: string; valor: string }[];
  // Seguimientos y avisos comerciales: llevan el enlace de baja.
  permiteBaja: boolean;
}

// Recordatorios que respetan la baja del cliente. El aviso de reserva no: el
// cliente pagó una seña y necesita saber que vence.
const CON_BAJA: TipoCorreo[] = [
  'SEGUIMIENTO_COTIZACION',
  'COTIZACION_POR_VENCER',
  'TASACION_POR_VENCER',
];

// Por qué un correo ya no corresponde al enviarlo (null = se envía). Desde que
// se planificó, la cotización pudo concretarse, el vehículo venderse o el
// cliente darse de baja.
export function motivoDescarte(tipo: TipoCorreo, d: DocumentoCorreoRow): string | null {
  if (tipo === 'DOCUMENTO') {
    return d.estado === 'ANULADA' || d.estado === 'CANCELADA' ? 'El documento fue anulado' : null;
  }
  if (d.estado !== 'VIGENTE') return `El documento ya no está vigente (${d.estado})`;
  if (!d.cliente_activo) return 'El cliente está inactivo';
  if (CON_BAJA.includes(tipo) && !d.acepta_recordatorios) {
    return 'El cliente pidió no recibir recordatorios';
  }
  if (tipo === 'SEGUIMIENTO_COTIZACION' && d.vehiculo_estado !== 'DISPONIBLE') {
    return 'El vehículo ya no está disponible';
  }
  if (
    tipo === 'COTIZACION_POR_VENCER' &&
    ['VENDIDO', 'RESERVADO', 'DADO_DE_BAJA'].includes(d.vehiculo_estado ?? '')
  ) {
    return 'El vehículo ya no está disponible';
  }
  return null;
}

export function contenidoCorreo(
  tipo: TipoCorreo,
  documentoTipo: TipoDocumentoCorreo,
  d: DocumentoCorreoRow,
  hoy: string,
): ContenidoCorreo {
  const monto = formatearCLP(Number(d.monto));
  const vence = d.fecha_vencimiento ? fechaLarga(d.fecha_vencimiento) : '';
  const venceCorto = d.fecha_vencimiento ? cuando(d.fecha_vencimiento, hoy) : '';
  const vehiculo = { etiqueta: 'Vehículo', valor: d.vehiculo };
  const patente = { etiqueta: 'Patente', valor: d.patente };
  const base = { permiteBaja: CON_BAJA.includes(tipo) };

  switch (tipo) {
    case 'SEGUIMIENTO_COTIZACION':
      return {
        ...base,
        asunto: `El ${d.vehiculo} sigue disponible`,
        titulo: 'Tu auto sigue disponible',
        parrafos: [
          `Hace unos días te cotizamos el ${d.vehiculo} y queremos contarte que sigue disponible.`,
          `Tu cotización N° ${d.folio} es válida hasta el ${vence}. Si quieres verlo, probarlo o resolver alguna duda, escríbenos.`,
        ],
        resumen: [vehiculo, { etiqueta: 'Precio cotizado', valor: monto }],
      };
    case 'COTIZACION_POR_VENCER':
      return {
        ...base,
        asunto: `Tu cotización del ${d.vehiculo} vence ${venceCorto}`,
        titulo: `Tu cotización vence ${venceCorto}`,
        parrafos: [
          `La cotización N° ${d.folio} del ${d.vehiculo} es válida hasta el ${vence}. Después de esa fecha, el precio y las condiciones pueden cambiar.`,
          'Si te interesa, escríbenos y lo coordinamos.',
        ],
        resumen: [vehiculo, { etiqueta: 'Precio cotizado', valor: monto }],
      };
    case 'RESERVA_POR_VENCER':
      return {
        ...base,
        asunto: `Tu reserva del ${d.vehiculo} vence ${venceCorto}`,
        titulo: `Tu reserva vence ${venceCorto}`,
        parrafos: [
          `La reserva N° ${d.folio} del ${d.vehiculo} está vigente hasta el ${vence}.`,
          'Contáctanos para concretar la compra o, si necesitas más tiempo, para conversar una extensión.',
        ],
        resumen: [vehiculo, { etiqueta: 'Monto de la reserva', valor: monto }],
      };
    case 'TASACION_POR_VENCER':
      return {
        ...base,
        asunto: `Nuestra oferta por tu ${d.vehiculo} vence ${venceCorto}`,
        titulo: `Nuestra oferta vence ${venceCorto}`,
        parrafos: [
          `La oferta de la tasación N° ${d.folio} por tu ${d.vehiculo} es válida hasta el ${vence}.`,
          'Si te interesa vendernos tu auto, escríbenos para coordinar.',
        ],
        resumen: [vehiculo, patente, { etiqueta: 'Oferta', valor: monto }],
      };
    case 'DOCUMENTO':
      return { ...base, ...contenidoDocumento(documentoTipo, d, monto, vence) };
  }
}

function contenidoDocumento(
  tipo: TipoDocumentoCorreo,
  d: DocumentoCorreoRow,
  monto: string,
  vence: string,
): Omit<ContenidoCorreo, 'permiteBaja'> {
  const vehiculo = { etiqueta: 'Vehículo', valor: d.vehiculo };
  const patente = { etiqueta: 'Patente', valor: d.patente };
  const adjunto = 'Adjuntamos el documento en PDF con el detalle.';
  switch (tipo) {
    case 'COTIZACION':
      return {
        asunto: `Tu cotización del ${d.vehiculo}`,
        titulo: 'Tu cotización',
        parrafos: [
          `Te enviamos la cotización N° ${d.folio} del ${d.vehiculo}. ${adjunto}`,
          `Es válida hasta el ${vence}.`,
        ],
        resumen: [vehiculo, { etiqueta: 'Precio cotizado', valor: monto }],
      };
    case 'RESERVA':
      return {
        asunto: `Tu reserva del ${d.vehiculo}`,
        titulo: 'Tu reserva está confirmada',
        parrafos: [
          `Confirmamos la reserva N° ${d.folio} del ${d.vehiculo}: queda reservado para ti hasta el ${vence}.`,
          adjunto,
        ],
        resumen: [vehiculo, { etiqueta: 'Monto de la reserva', valor: monto }],
      };
    case 'TASACION':
      return {
        asunto: `Nuestra oferta por tu ${d.vehiculo}`,
        titulo: 'Tasación de tu auto',
        parrafos: [
          `Te enviamos la tasación N° ${d.folio} de tu ${d.vehiculo}. ${adjunto}`,
          `Nuestra oferta es válida hasta el ${vence}.`,
        ],
        resumen: [vehiculo, patente, { etiqueta: 'Oferta', valor: monto }],
      };
    case 'VENTA':
      return {
        asunto: `Comprobante de compra de tu ${d.vehiculo}`,
        titulo: '¡Gracias por tu compra!',
        parrafos: [
          `Adjuntamos el comprobante de la venta N° ${d.folio} de tu ${d.vehiculo}.`,
          'Guárdalo junto a los documentos del auto.',
        ],
        resumen: [vehiculo, patente, { etiqueta: 'Precio final', valor: monto }],
      };
    case 'CONSIGNACION':
      return {
        asunto: `Consignación de tu ${d.vehiculo}`,
        titulo: 'Recibimos tu auto en consignación',
        parrafos: [
          `Registramos la consignación N° ${d.folio} de tu ${d.vehiculo}. Adjuntamos el documento con las condiciones acordadas.`,
          `Vigente hasta el ${vence}.`,
        ],
        resumen: [vehiculo, patente, { etiqueta: 'Precio de publicación', valor: monto }],
      };
  }
}

// Celular para WhatsApp de la sucursal: el propio, o el teléfono si es celular.
export function whatsappSucursal(d: DocumentoCorreoRow): string | null {
  const numero = (d.sucursal_whatsapp ?? d.sucursal_telefono).replace(/\D/g, '');
  const completo = numero.length === 9 ? `56${numero}` : numero;
  return /^569\d{8}$/.test(completo) ? completo : null;
}

export function telefonoSucursal(d: DocumentoCorreoRow): string {
  return formatearTelefono(d.sucursal_telefono);
}

export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

// "lunes 6 de octubre" (sin la coma que agrega Intl después del día).
export function fechaLarga(fecha: string): string {
  const partes = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(new Date(`${fecha}T12:00:00Z`));
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('weekday')} ${parte('day')} de ${parte('month')}`;
}

// "hoy", "mañana" o "el lunes 6 de octubre"
export function cuando(fecha: string, hoy: string): string {
  if (fecha === hoy) return 'hoy';
  if (fecha === sumarDias(hoy, 1)) return 'mañana';
  return `el ${fechaLarga(fecha)}`;
}
