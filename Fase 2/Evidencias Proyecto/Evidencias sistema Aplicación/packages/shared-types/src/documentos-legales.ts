import { z } from 'zod';
import { mesRevisionTecnica, type TipoDocumentoLegal } from './vehiculos';

// Documentos legales (Módulo 7.5): qué respalda cada archivo y qué vencimientos
// son posibles. Las reglas viven aquí para que el panel y la API validen igual.

// Qué es el archivo subido. Para el SOAP, el permiso y la homologación la fecha
// de vencimiento la fija la regla, no la escribe el usuario.
export const RespaldoDocumentoLegal = z.enum([
  'CERTIFICADO_REVISION', // revisión técnica (y de gases) vigente
  'CERTIFICADO_HOMOLOGACION', // vehículo nuevo, aún exento de revisión técnica
  'POLIZA_SOAP',
  'PERMISO_PAGO_TOTAL',
  'PERMISO_PRIMERA_CUOTA', // pagado en 2 cuotas, solo la primera
]);
export type RespaldoDocumentoLegal = z.infer<typeof RespaldoDocumentoLegal>;

export const RESPALDOS_POR_TIPO: Record<TipoDocumentoLegal, RespaldoDocumentoLegal[]> = {
  REVISION_TECNICA: ['CERTIFICADO_REVISION', 'CERTIFICADO_HOMOLOGACION'],
  SOAP: ['POLIZA_SOAP'],
  PERMISO_CIRCULACION: ['PERMISO_PAGO_TOTAL', 'PERMISO_PRIMERA_CUOTA'],
};

// Meses desde la primera inscripción en que un vehículo nuevo queda exento de
// revisión técnica (le basta el certificado de homologación). Simplificación
// asumida: un plazo único para todos los vehículos livianos.
export const MESES_EXENCION_HOMOLOGACION = 24;

// Cuánto puede durar como máximo una revisión técnica: es anual.
const MESES_MAXIMOS_REVISION = 12;

function ultimoDiaDelMes(anio: number, mes: number): string {
  const dia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function partes(fecha: string): [number, number, number] {
  const [a, m, d] = fecha.split('-').map(Number);
  return [a, m, d];
}

// El permiso y el SOAP se pagan desde febrero y cubren de abril a marzo. Año del
// último período que ya se pudo pagar a la fecha `hoy` (YYYY-MM-DD).
export function anioDePago(hoy: string): number {
  const [anio, mes] = partes(hoy);
  return mes >= 2 ? anio : anio - 1;
}

// Vencimientos posibles de un respaldo con fecha fija (SOAP y permiso), del más
// reciente al más antiguo. Se aceptan vencidos: un vehículo puede llegar así.
export function vencimientosPosibles(
  respaldo: RespaldoDocumentoLegal,
  hoy: string,
  cantidad = 4,
): string[] {
  const pago = anioDePago(hoy);
  if (respaldo === 'POLIZA_SOAP' || respaldo === 'PERMISO_PAGO_TOTAL') {
    return Array.from({ length: cantidad }, (_, i) => `${pago + 1 - i}-03-31`);
  }
  if (respaldo === 'PERMISO_PRIMERA_CUOTA') {
    return Array.from({ length: cantidad }, (_, i) => `${pago - i}-08-31`);
  }
  return [];
}

// Vehículo nuevo: su primera revisión técnica toca en el mes que corresponde a su
// patente, el año en que se cumple la exención (sin dígito: el mes en que se cumple).
export function vencimientoHomologacion(fechaPrimeraInscripcion: string, patente: string): string {
  const [anio, mes] = partes(fechaPrimeraInscripcion);
  const total = anio * 12 + (mes - 1) + MESES_EXENCION_HOMOLOGACION;
  const anioFin = Math.floor(total / 12);
  const mesFin = (total % 12) + 1;
  return ultimoDiaDelMes(anioFin, mesRevisionTecnica(patente) ?? mesFin);
}

// Aviso (no bloquea): la revisión técnica vence en un mes que no es el de la patente.
export function avisoMesRevision(patente: string, fechaVencimiento: string): string | null {
  const esperado = mesRevisionTecnica(patente);
  if (esperado === null) return null;
  const mes = partes(fechaVencimiento)[1];
  if (mes === esperado) return null;
  return `Por su patente, la revisión técnica debería vencer en ${MESES[esperado - 1]}, no en ${MESES[mes - 1]}`;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export interface DatosDocumentoLegal {
  tipo: TipoDocumentoLegal;
  respaldo: RespaldoDocumentoLegal;
  fechaVencimiento?: string | null;
  fechaPrimeraInscripcion?: string | null;
}

export interface VehiculoDelDocumento {
  patente: string;
  anio: number;
}

export type ResultadoDocumentoLegal =
  | { ok: true; fechaVencimiento: string; fechaPrimeraInscripcion: string | null }
  | { ok: false; error: string };

// Valida un documento antes de guardarlo y devuelve el vencimiento definitivo
// (calculado cuando lo fija la regla). `hoy` en YYYY-MM-DD, zona de Chile.
export function validarDocumentoLegal(
  datos: DatosDocumentoLegal,
  vehiculo: VehiculoDelDocumento,
  hoy: string,
): ResultadoDocumentoLegal {
  const { tipo, respaldo } = datos;
  if (!RESPALDOS_POR_TIPO[tipo]?.includes(respaldo)) {
    return { ok: false, error: 'Ese respaldo no corresponde a este documento' };
  }

  if (respaldo === 'CERTIFICADO_HOMOLOGACION') {
    const inscripcion = datos.fechaPrimeraInscripcion;
    if (!inscripcion) return { ok: false, error: 'Indica la fecha de primera inscripción' };
    if (inscripcion > hoy) {
      return { ok: false, error: 'La fecha de primera inscripción no puede ser futura' };
    }
    if (partes(inscripcion)[0] < vehiculo.anio - 1) {
      return {
        ok: false,
        error: `Un ${vehiculo.anio} no pudo inscribirse antes de ${vehiculo.anio - 1}: revisa la fecha`,
      };
    }
    const vence = vencimientoHomologacion(inscripcion, vehiculo.patente);
    if (vence < hoy) {
      return {
        ok: false,
        error:
          'Su exención por ser nuevo ya terminó: debe tener revisión técnica. Sube el certificado de revisión',
      };
    }
    return { ok: true, fechaVencimiento: vence, fechaPrimeraInscripcion: inscripcion };
  }

  const fecha = datos.fechaVencimiento;
  if (!fecha) return { ok: false, error: 'Indica la fecha de vencimiento' };

  if (respaldo === 'CERTIFICADO_REVISION') {
    const [anio, mes] = partes(hoy);
    const total = anio * 12 + (mes - 1) + MESES_MAXIMOS_REVISION;
    const maximo = ultimoDiaDelMes(Math.floor(total / 12), (total % 12) + 1);
    if (fecha > maximo) {
      return {
        ok: false,
        error: 'La revisión técnica dura un año: no puede vencer más allá de 12 meses desde hoy',
      };
    }
    return { ok: true, fechaVencimiento: fecha, fechaPrimeraInscripcion: null };
  }

  // SOAP y permiso: solo vencimientos de la regla, y nunca de un período aún no pagable.
  if (!vencimientosPosibles(respaldo, hoy, 60).includes(fecha)) {
    const maximo = vencimientosPosibles(respaldo, hoy, 1)[0];
    const dia = respaldo === 'PERMISO_PRIMERA_CUOTA' ? '31 de agosto' : '31 de marzo';
    return {
      ok: false,
      error: `Este documento vence el ${dia}; a la fecha, a más tardar el ${dia} de ${maximo.slice(0, 4)}`,
    };
  }
  return { ok: true, fechaVencimiento: fecha, fechaPrimeraInscripcion: null };
}
