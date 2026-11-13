import { z } from 'zod';

// Enums espejo de docs/schema.sql.
export const EstadoVehiculo = z.enum([
  'DISPONIBLE',
  'RESERVADO',
  'EN_PREPARACION',
  'PENDIENTE_REVISION',
  'VENDIDO',
  'DADO_DE_BAJA',
]);
export type EstadoVehiculo = z.infer<typeof EstadoVehiculo>;

// Estados que un usuario puede fijar a mano; RESERVADO y VENDIDO solo los fijan
// Reservas y Ventas. PENDIENTE_REVISION (enviado a revisión o recibido en parte
// de pago) solo un admin lo publica.
export const ESTADOS_VEHICULO_MANUALES = [
  'DISPONIBLE',
  'EN_PREPARACION',
  'PENDIENTE_REVISION',
  'DADO_DE_BAJA',
] as const;
export type EstadoVehiculoManual = (typeof ESTADOS_VEHICULO_MANUALES)[number];

export const OrigenVehiculo = z.enum([
  'COMPRA_DIRECTA',
  'CONSIGNACION',
  'PARTE_PAGO',
  'COMPRA_PARTICULAR',
]);
export type OrigenVehiculo = z.infer<typeof OrigenVehiculo>;

export const CategoriaVehiculo = z.enum([
  'SUV',
  'SEDAN',
  'HATCHBACK',
  'CAMIONETA',
  'CAMION',
  'MOTO',
  'OTRO',
]);
// La tracción no aplica a las motos (queda vacía); en el resto es obligatoria.
export const TraccionVehiculo = z.enum(['X4X2', 'X4X4', 'AWD', 'OTRO']);
export const CombustibleVehiculo = z.enum([
  'BENCINA',
  'DIESEL',
  'HIBRIDO',
  'ELECTRICO',
  'GAS',
  'OTRO',
]);
export const TransmisionVehiculo = z.enum(['MANUAL', 'AUTOMATICA', 'OTRO']);
export const TipoDocumentoLegal = z.enum(['PERMISO_CIRCULACION', 'REVISION_TECNICA', 'SOAP']);
export type TipoDocumentoLegal = z.infer<typeof TipoDocumentoLegal>;
// Trato con el consignante: % del precio de venta o precio neto garantizado.
export const TipoTrato = z.enum(['COMISION_VENTA', 'PRECIO_NETO']);
export type TipoTrato = z.infer<typeof TipoTrato>;

export const FOTOS_MAXIMAS_POR_VEHICULO = 30;

// Patente chilena normalizada: mayúsculas, sin espacios, puntos ni guiones.
export function normalizarPatente(patente: string): string {
  return patente.replace(/[\s.·-]/g, '').toUpperCase();
}

// Formatos: autos "AB1234" (antiguo) y "BCDF12" (nuevo); motos "ABC12" / "AB123".
const PATENTE_REGEX = /^(?:[A-Z]{2}\d{4}|[A-Z]{4}\d{2}|[A-Z]{3}\d{2}|[A-Z]{2}\d{3})$/;

export function esPatenteValida(patente: string): boolean {
  return PATENTE_REGEX.test(normalizarPatente(patente));
}

// Mes (1-12) de la revisión técnica según el último dígito de la patente.
// Marzo y diciembre no tienen dígito asignado.
const MES_REVISION_POR_DIGITO: Record<string, number> = {
  '9': 1,
  '0': 2,
  '1': 4,
  '2': 5,
  '3': 6,
  '4': 7,
  '5': 8,
  '6': 9,
  '7': 10,
  '8': 11,
};

export function mesRevisionTecnica(patente: string): number | null {
  const ultimo = normalizarPatente(patente).slice(-1);
  return MES_REVISION_POR_DIGITO[ultimo] ?? null;
}

// Fecha sugerida (YYYY-MM-DD): último día del mes que corresponde, en su
// próxima ocurrencia desde `hoy`. El usuario puede ajustar el año.
export function sugerirVencimientoRevisionTecnica(
  patente: string,
  hoy: Date = new Date(),
): string | null {
  const mes = mesRevisionTecnica(patente);
  if (mes === null) return null;
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;
  const anio = mes >= mesActual ? anioActual : anioActual + 1;
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
}
