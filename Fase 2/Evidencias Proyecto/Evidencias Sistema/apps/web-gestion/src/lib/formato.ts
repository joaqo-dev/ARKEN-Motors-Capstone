const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});
const numero = new Intl.NumberFormat('es-CL');

export const pesos = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v < 0 ? `−${clp.format(-v)}` : clp.format(v);
// Montos cortos para ejes y etiquetas: $28M, $450k.
export const pesosCompacto = (v: number) => {
  const a = Math.abs(v);
  const signo = v < 0 ? '−' : '';
  if (a >= 1_000_000)
    return `${signo}$${(a / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: a >= 10_000_000 ? 0 : 1 })}M`;
  if (a >= 1_000) return `${signo}$${Math.round(a / 1_000)}k`;
  return `${signo}$${a}`;
};

const relativo = new Intl.RelativeTimeFormat('es-CL', { numeric: 'auto' });
// Día calendario de Chile ('YYYY-MM-DD') de una fecha 'YYYY-MM-DD' o de un instante ISO.
// Un instante se lleva a America/Santiago: cortar el ISO (que viene en UTC) adelanta un día
// todo lo registrado después de las 21:00 en verano.
export const diaChile = (v: string) =>
  v.length > 10
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(v))
    : v;

// Días calendario de Chile transcurridos desde una fecha o instante hasta hoy.
export const diasDesde = (v: string) =>
  Math.round(
    (new Date(`${hoy()}T12:00:00Z`).getTime() - new Date(`${diaChile(v)}T12:00:00Z`).getTime()) /
      86_400_000,
  );

// "hoy", "ayer", "hace 3 días", "hace 2 meses".
// Acepta fechas 'YYYY-MM-DD' o instantes ISO (estos se llevan a la fecha de Chile).
export const haceCuanto = (v: string) => {
  const dias = diasDesde(v);
  if (dias < 30) return relativo.format(-dias, 'day');
  if (dias < 365) return relativo.format(-Math.round(dias / 30), 'month');
  return relativo.format(-Math.round(dias / 365), 'year');
};

export const km = (v: number) => `${numero.format(v)} km`;
export const num = (v: number) => numero.format(v);

// 'YYYY-MM-DD' o instante ISO → 'DD-MM-YYYY' (día de Chile)
export const fecha = (v: string | null | undefined) =>
  v ? diaChile(v).split('-').reverse().join('-') : '—';

export const fechaHora = (v: string | Date | null | undefined) =>
  v
    ? new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(v))
    : '—';

export const hoy = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

const ETIQUETAS: Record<string, string> = {
  // roles
  ADMIN_GENERAL: 'Admin General',
  ADMIN_SUCURSAL: 'Admin de Sucursal',
  VENDEDOR: 'Vendedor',
  // estados de vehículo
  DISPONIBLE: 'Disponible',
  RESERVADO: 'Reservado',
  EN_PREPARACION: 'En preparación',
  PENDIENTE_REVISION: 'Pendiente de revisión',
  VENDIDO: 'Vendido',
  DADO_DE_BAJA: 'Dado de baja',
  // orígenes
  COMPRA_DIRECTA: 'Compra directa',
  CONSIGNACION: 'Consignación',
  PARTE_PAGO: 'Parte de pago',
  COMPRA_PARTICULAR: 'Compra a particular',
  // categorías y características
  SUV: 'SUV',
  SEDAN: 'Sedán',
  HATCHBACK: 'Hatchback',
  CAMIONETA: 'Camioneta',
  CAMION: 'Camión',
  MOTO: 'Moto',
  MANUAL: 'Manual',
  AUTOMATICA: 'Automática',
  BENCINA: 'Bencina',
  DIESEL: 'Diésel',
  HIBRIDO: 'Híbrido',
  ELECTRICO: 'Eléctrico',
  GAS: 'Gas',
  X4X2: '4x2',
  X4X4: '4x4',
  AWD: 'AWD',
  OTRO: 'Otro',
  // documentos legales
  PERMISO_CIRCULACION: 'Permiso de circulación',
  REVISION_TECNICA: 'Revisión técnica',
  SOAP: 'SOAP',
  CERTIFICADO_REVISION: 'Certificado de revisión técnica',
  CERTIFICADO_HOMOLOGACION: 'Certificado de homologación (vehículo nuevo)',
  POLIZA_SOAP: 'Póliza SOAP',
  PERMISO_PAGO_TOTAL: 'Pago total',
  PERMISO_PRIMERA_CUOTA: 'Primera cuota',
  // estados de documentos
  VIGENTE: 'Vigente',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  // inspección pre-compra
  BORRADOR: 'Borrador',
  FINALIZADA: 'Finalizada',
  APROBADO: 'Aprobado',
  APROBADO_CON_OBSERVACIONES: 'Aprobado con observaciones',
  NO_APROBADO: 'No aprobado',
  BUENO: 'Bueno',
  REGULAR: 'Regular',
  MALO: 'Malo',
  NO_APLICA: 'No aplica',
  VENCIDA: 'Vencida',
  CONCRETADA: 'Concretada',
  ANULADA: 'Anulada',
  CONVERTIDA_EN_VENTA: 'Convertida en venta',
  CANCELADA: 'Cancelada',
  CONFIRMADA: 'Confirmada',
  ACTIVA: 'Activa',
  DEVUELTA: 'Devuelta',
  VENDIDA: 'Vendida',
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  ANULADO: 'Anulado',
  PENDIENTE: 'Pendiente',
  RESUELTA: 'Resuelta',
  // gastos
  MECANICA: 'Mecánica',
  ESTETICA: 'Estética',
  DOCUMENTACION: 'Documentación',
  TRAMITES: 'Trámites',
  // categorías de gastos operacionales
  ARRIENDO: 'Arriendo',
  SUELDOS_COMISIONES: 'Sueldos y comisiones',
  PUBLICIDAD: 'Publicidad',
  SERVICIOS_BASICOS: 'Servicios básicos',
  MANTENCION_LOCAL: 'Mantención del local',
  CONTABILIDAD_LEGAL: 'Contabilidad y legal',
  IMPUESTOS_PATENTES: 'Impuestos y patentes',
  OTROS: 'Otros',
  // tipos de gasto
  OPERACIONAL: 'Operacional',
  // formas de pago
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  FINANCIAMIENTO: 'Financiamiento',
  // comisión
  COMISION_VENTA: 'Comisión sobre la venta',
  PRECIO_NETO: 'Precio neto al dueño',
  // notificaciones
  RESERVA_POR_VENCER: 'Reserva por vencer',
  CONSIGNACION_POR_VENCER: 'Consignación por vencer',
  DOCUMENTO_LEGAL_POR_VENCER: 'Documento legal por vencer',
};

export const etiqueta = (v: string | null | undefined) => (v ? (ETIQUETAS[v] ?? v) : '—');

// Fotos (vehículos, logo y banner): se aceptan los formatos de cámara y celular
// (HEIC del iPhone incluido); el servidor las convierte todas a WEBP.
export const ACEPTA_FOTOS =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif';

// Algunos navegadores no informan el tipo de un HEIC: se revisa también la extensión.
export const esFormatoFoto = (archivo: File) =>
  /^image\/(jpeg|png|webp|heic|heif|avif)$/.test(archivo.type) ||
  /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(archivo.name);

// Documentos privados (boletas, documentos legales): PDF o imagen; el HEIC/AVIF
// del celular se guarda como JPG.
export const ACEPTA_DOCUMENTOS =
  'application/pdf,image/jpeg,image/png,image/heic,image/heif,image/avif,.heic,.heif';
