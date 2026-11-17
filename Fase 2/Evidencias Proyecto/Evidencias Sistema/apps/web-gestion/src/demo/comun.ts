import { pendientesVehiculo } from '@vitriauto/shared-types';
import { ApiError } from '../lib/api';
import { hoy } from '../lib/formato';
import type { Usuario } from '../lib/tipos';
import { descripcionVehiculo } from '../features/vehiculos/tipos';
import {
  datos,
  type FilaConsignacion,
  type FilaCotizacion,
  type FilaGasto,
  type FilaReserva,
  type FilaTasacion,
  type FilaVehiculo,
  type FilaVenta,
} from './db';

// Piezas compartidas por los manejadores de la API en memoria. Imitan las
// reglas de la API real (docs/01-modulos-funcionales.md) en lo que el panel
// necesita para verse y comportarse igual: alcance por rol, folios, estados.

export interface Contexto {
  usuario: Usuario;
  automotoraId: string;
  esGeneral: boolean;
  esAdmin: boolean; // el Vendedor no ve costos ni administra
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type Manejador = (c: Contexto) => unknown;
export type Rutas = Record<string, Manejador>;

export const fallo = (status: number, mensaje: string) => new ApiError(status, mensaje);
export const noEncontrado = (que: string) => fallo(404, `${que} no encontrado`);

export function soloAdmin(c: Contexto) {
  if (!c.esAdmin) throw fallo(403, 'No tienes permiso para esta acción');
}
export function soloGeneral(c: Contexto) {
  if (!c.esGeneral) throw fallo(403, 'Solo el Admin General puede hacer esto');
}

let secuencia = Date.now();
export const nuevoId = (prefijo: string) => `${prefijo}-${(secuencia++).toString(36)}`;
export const ahora = () => new Date().toISOString();

export function siguienteFolio(automotoraId: string, tipo: string): number {
  const db = datos();
  const clave = `${automotoraId}:${tipo}`;
  db.folios[clave] = (db.folios[clave] ?? 0) + 1;
  return db.folios[clave];
}

// Fecha 'YYYY-MM-DD' a n días de otra.
export const sumarDias = (fecha: string, n: number) =>
  new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Fecha en Chile de un instante ISO.
export const fechaChile = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(iso));

export const diasDesde = (iso: string, hasta = hoy()) =>
  Math.floor(
    (Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${fechaChile(iso)}T12:00:00Z`)) / 86_400_000,
  );

// ---------------------------------------------------------------- Lectura de la consulta

export const texto = (c: Contexto, clave: string) => c.query.get(clave) || undefined;
export const numero = (c: Contexto, clave: string, porDefecto: number) => {
  const v = Number(c.query.get(clave));
  return Number.isFinite(v) && c.query.has(clave) ? v : porDefecto;
};

export function paginar<T>(c: Contexto, items: T[], limite = 25) {
  const limit = numero(c, 'limit', limite);
  const offset = numero(c, 'offset', 0);
  return { items: items.slice(offset, offset + limit), total: items.length };
}

// Cuerpo JSON o FormData como objeto (los archivos quedan como File).
export function cuerpo(c: Contexto): Record<string, unknown> {
  if (c.body instanceof FormData) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of c.body.entries()) o[k] = v;
    return o;
  }
  return (c.body as Record<string, unknown> | undefined) ?? {};
}

// Sucursales visibles: el Admin General ve todas (o la elegida en ?sucursalId);
// el resto, solo la suya. null = todas.
export function sucursalesVisibles(c: Contexto, param = 'sucursalId'): string[] | null {
  if (!c.esGeneral) return [c.usuario.sucursalId!];
  const pedidas = c.query
    .getAll(param)
    .flatMap((v) => v.split(','))
    .filter(Boolean);
  return pedidas.length ? pedidas : null;
}
export const visible = (alcance: string[] | null, sucursalId: string | null) =>
  alcance === null || (sucursalId !== null && alcance.includes(sucursalId));

// Comprueba que un registro sea de la automotora (y sucursal) del usuario.
export function delAlcance<T extends { automotoraId: string }>(
  c: Contexto,
  fila: T | undefined,
  sucursalId: (f: T) => string | null,
  que: string,
): T {
  if (!fila || fila.automotoraId !== c.automotoraId) throw noEncontrado(que);
  if (!c.esGeneral && sucursalId(fila) !== c.usuario.sucursalId) throw noEncontrado(que);
  return fila;
}

// Busca sin acentos ni mayúsculas.
const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const coincide = (
  q: string | undefined,
  ...campos: (string | number | null | undefined)[]
) => !q || campos.some((v) => v !== null && v !== undefined && plano(String(v)).includes(plano(q)));

// ---------------------------------------------------------------- Referencias

export const sucursalDe = (id: string | null) => {
  const s = datos().sucursales.find((x) => x.id === id);
  return { id: id ?? '', nombre: s?.nombre ?? '—' };
};
export const clienteRef = (id: string) => {
  const cl = datos().clientes.find((x) => x.id === id);
  return { id, nombre: cl?.nombre ?? '—', rut: cl?.rut ?? '' };
};
export const usuarioRef = (id: string) => ({
  id,
  nombre: datos().usuarios.find((u) => u.id === id)?.nombre ?? '—',
});
export const vehiculoDe = (id: string) => datos().vehiculos.find((v) => v.id === id);

export const descripcion = (v: FilaVehiculo | undefined) => (v ? descripcionVehiculo(v) : '—');

// ---------------------------------------------------------------- Estados según la fecha

const vencido = (fecha: string) => fecha < hoy();

export const estadoCotizacion = (x: FilaCotizacion) =>
  x.estado === 'VIGENTE' && vencido(x.fechaVencimiento) ? 'VENCIDA' : x.estado;
export const estadoReserva = (x: FilaReserva) =>
  x.estado === 'VIGENTE' && vencido(x.fechaVencimiento) ? 'VENCIDA' : x.estado;
export const estadoTasacion = (x: FilaTasacion) =>
  x.estado === 'VIGENTE' && vencido(x.fechaVencimiento) ? 'VENCIDA' : x.estado;
export const estadoConsignacion = (x: FilaConsignacion) =>
  x.estado === 'ACTIVA' && vencido(x.fechaFin) ? 'VENCIDA' : x.estado;

export const EN_INVENTARIO = (v: FilaVehiculo) =>
  v.estado !== 'VENDIDO' && v.estado !== 'DADO_DE_BAJA';

// ---------------------------------------------------------------- Bitácora y auditoría

export function registrarEvento(
  c: Contexto,
  vehiculoId: string,
  tipoEvento: string,
  descripcionEvento: string,
) {
  datos().bitacora.unshift({
    id: nuevoId('bit'),
    vehiculoId,
    tipoEvento,
    descripcion: descripcionEvento,
    fecha: ahora(),
    usuarioId: c.usuario.id,
  });
}

export function auditar(
  c: Contexto,
  accion: string,
  entidad: { tipo: string; id: string },
  sucursalId: string | null,
  valorNuevo: Record<string, unknown> | null = null,
  valorAnterior: Record<string, unknown> | null = null,
) {
  datos().auditoria.unshift({
    id: nuevoId('aud'),
    automotoraId: c.automotoraId,
    fecha: ahora(),
    usuarioId: c.usuario.id,
    sucursalId,
    accion,
    entidad,
    valorAnterior,
    valorNuevo,
  });
}

// ---------------------------------------------------------------- Dinero

export const gastosDelVehiculo = (vehiculoId: string) =>
  datos().gastos.filter((g) => g.vehiculoId === vehiculoId && g.estado === 'ACTIVO');
export const totalGastosVehiculo = (vehiculoId: string) =>
  gastosDelVehiculo(vehiculoId).reduce((s, g) => s + g.monto, 0);

// Comisión de la automotora por un auto consignado a un precio dado (Módulo 9).
export function comisionConsignacion(cons: FilaConsignacion, precio: number) {
  return cons.tipoTrato === 'COMISION_VENTA'
    ? Math.round((precio * (cons.porcentajeComision ?? 0)) / 100)
    : precio - (cons.montoNeto ?? 0);
}
export const consignacionDe = (vehiculoId: string) =>
  datos()
    .consignaciones.filter((x) => x.vehiculoId === vehiculoId)
    .sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion))[0];

// Margen de una venta: precio − costo − gastos (propios) o la comisión (consignados).
export function margenVenta(v: FilaVehiculo, precio: number) {
  const cons = v.origen === 'CONSIGNACION' ? consignacionDe(v.id) : undefined;
  return cons
    ? comisionConsignacion(cons, precio)
    : precio - v.costoAdquisicion - totalGastosVehiculo(v.id);
}

// ---------------------------------------------------------------- Mapeos a las respuestas de la API

// Copia de un objeto sin algunos campos (los internos de la demo).
export function sin<T extends object, K extends keyof T>(objeto: T, ...claves: K[]): Omit<T, K> {
  const copia = { ...objeto };
  for (const k of claves) delete copia[k];
  return copia;
}

export function vehiculoListado(c: Contexto, v: FilaVehiculo) {
  return {
    ...sin(v, 'automotoraId', 'sucursalId', 'fotos', 'documentos', 'costoAdquisicion'),
    sucursal: sucursalDe(v.sucursalId),
    ...(c.esAdmin ? { costoAdquisicion: v.costoAdquisicion } : {}),
    fotoPortada: v.fotos[0]?.url ?? null,
    observacionRevision: v.observacionRevision ?? null,
    pendientes: pendientesDe(v),
  };
}

// Qué le falta (Módulo 7.6): mismas reglas que la API.
export function pendientesDe(v: FilaVehiculo) {
  const hoyChile = hoy();
  const ultima = datos()
    .inspecciones.filter((i) => i.vehiculoId === v.id && i.estado === 'FINALIZADA')
    .sort((a, b) => (b.fechaFinalizacion ?? '').localeCompare(a.fechaFinalizacion ?? ''))[0];
  return pendientesVehiculo({
    fotos: v.fotos.length,
    version: v.version,
    cilindrada: v.cilindrada,
    combustible: v.combustible,
    descripcion: v.descripcion,
    documentos: v.documentos
      .filter((d) => d.vigente)
      .map((d) => ({ tipo: d.tipo, vencido: d.fechaVencimiento < hoyChile })),
    inspeccionAprobada:
      ultima?.resultado === 'APROBADO' || ultima?.resultado === 'APROBADO_CON_OBSERVACIONES',
  });
}

export function consignacionResumen(c: Contexto, x: FilaConsignacion) {
  return {
    id: x.id,
    folio: x.folio,
    clienteId: x.clienteId,
    ...(c.esAdmin
      ? { tipoTrato: x.tipoTrato, porcentajeComision: x.porcentajeComision, montoNeto: x.montoNeto }
      : {}),
    precioMinimo: x.precioMinimo,
    fechaInicio: x.fechaInicio,
    fechaFin: x.fechaFin,
    estado: estadoConsignacion(x),
  };
}

export function vehiculoDetalle(c: Contexto, v: FilaVehiculo) {
  const cons = v.origen === 'CONSIGNACION' ? consignacionDe(v.id) : undefined;
  return {
    ...vehiculoListado(c, v),
    fotos: [...v.fotos].sort((a, b) => a.orden - b.orden),
    documentosLegales: v.documentos.filter((d) => d.vigente).map(({ cargadoPorId: _, ...d }) => d),
    consignacion: cons ? consignacionResumen(c, cons) : null,
  };
}

const PDF = '/documentos/demo.pdf';

export function cotizacionDto(x: FilaCotizacion) {
  const v = vehiculoDe(x.vehiculoId);
  const venta = x.ventaId ? datos().ventas.find((y) => y.id === x.ventaId) : undefined;
  return {
    id: x.id,
    folio: x.folio,
    sucursal: sucursalDe(x.sucursalId),
    cliente: clienteRef(x.clienteId),
    vehiculo: {
      id: x.vehiculoId,
      patente: v?.patente ?? '',
      descripcion: descripcion(v),
      estado: v?.estado ?? '',
    },
    precioCotizado: x.precioCotizado,
    costosAdicionales: x.costosAdicionales,
    vigenciaDias: x.vigenciaDias,
    fechaEmision: x.fechaEmision,
    fechaVencimiento: x.fechaVencimiento,
    estado: estadoCotizacion(x),
    venta: venta ? { id: venta.id, folio: venta.folio } : null,
    emitidaPor: usuarioRef(x.emitidaPorId),
    anulacion: x.anulacion,
    pdfUrl: PDF,
  };
}

export function reservaDto(x: FilaReserva) {
  const v = vehiculoDe(x.vehiculoId);
  return {
    id: x.id,
    folio: x.folio,
    sucursal: sucursalDe(x.sucursalId),
    cliente: clienteRef(x.clienteId),
    vehiculo: {
      id: x.vehiculoId,
      patente: v?.patente ?? '',
      descripcion: descripcion(v),
      estado: v?.estado ?? '',
      precioVenta: v?.precioVenta ?? 0,
    },
    montoReserva: x.montoReserva,
    condicionesDevolucion: x.condicionesDevolucion,
    fechaEmision: x.fechaEmision,
    fechaVencimiento: x.fechaVencimiento,
    estado: estadoReserva(x),
    emitidaPor: usuarioRef(x.emitidaPorId),
    cancelacion: x.cancelacion,
    pdfUrl: PDF,
  };
}

export function ventaDto(c: Contexto, x: FilaVenta) {
  const db = datos();
  const v = vehiculoDe(x.vehiculoId);
  const reserva = x.reservaId ? db.reservas.find((r) => r.id === x.reservaId) : undefined;
  const cot = x.cotizacionId ? db.cotizaciones.find((r) => r.id === x.cotizacionId) : undefined;
  return {
    id: x.id,
    folio: x.folio,
    sucursal: sucursalDe(x.sucursalId),
    cliente: clienteRef(x.clienteId),
    vehiculo: {
      id: x.vehiculoId,
      patente: v?.patente ?? '',
      descripcion: descripcion(v),
      origen: v?.origen ?? '',
    },
    precioVentaFinal: x.precioVentaFinal,
    reserva: reserva
      ? { id: reserva.id, folio: reserva.folio, senaDescontada: x.senaDescontada }
      : null,
    cotizacion: cot ? { id: cot.id, folio: cot.folio } : null,
    saldoPagado: x.formasPago.reduce((s, f) => s + f.monto, 0),
    formasPago: x.formasPago.map((f) => {
      const recibido = f.vehiculoRecibidoId ? vehiculoDe(f.vehiculoRecibidoId) : undefined;
      return {
        tipo: f.tipo,
        monto: f.monto,
        vehiculoRecibido: recibido ? { id: recibido.id, patente: recibido.patente } : null,
      };
    }),
    costosAdicionales: x.costosAdicionales,
    fechaVenta: x.fechaVenta,
    estado: x.estado,
    vendidaPor: usuarioRef(x.vendidaPorId),
    anulacion: x.anulacion,
    pdfUrl: PDF,
    ...(c.esAdmin ? { liquidacionConsignacion: x.liquidacion } : {}),
  };
}

export function tasacionDto(x: FilaTasacion) {
  return {
    id: x.id,
    folio: x.folio,
    sucursal: sucursalDe(x.sucursalId),
    cliente: clienteRef(x.clienteId),
    vehiculoTasado: x.vehiculoTasado,
    ofertaMonto: x.ofertaMonto,
    fechaEmision: x.fechaEmision,
    fechaVencimiento: x.fechaVencimiento,
    estado: estadoTasacion(x),
    emitidaPor: usuarioRef(x.emitidaPorId),
    vehiculoCreadoId: x.vehiculoCreadoId,
    anulacion: x.anulacion,
    pdfUrl: PDF,
  };
}

export function consignacionDto(c: Contexto, x: FilaConsignacion) {
  const v = vehiculoDe(x.vehiculoId);
  return {
    ...consignacionResumen(c, x),
    cliente: clienteRef(x.clienteId),
    vehiculo: {
      id: x.vehiculoId,
      patente: v?.patente ?? '',
      descripcion: descripcion(v),
      estado: v?.estado ?? '',
      precioVenta: v?.precioVenta ?? 0,
      sucursal: sucursalDe(v?.sucursalId ?? null),
    },
    sucursalRegistroId: x.sucursalRegistroId,
    diasEnStock: v && EN_INVENTARIO(v) ? diasDesde(v.fechaIngreso) : null,
    fechaCreacion: x.fechaCreacion,
    pdfUrl: PDF,
  };
}

export function gastoDto(x: FilaGasto) {
  const v = x.vehiculoId ? vehiculoDe(x.vehiculoId) : undefined;
  return {
    id: x.id,
    numero: x.numero,
    tipo: x.tipo,
    vehiculo: v ? { id: v.id, patente: v.patente, descripcion: descripcion(v) } : null,
    sucursal: x.sucursalId ? sucursalDe(x.sucursalId) : null,
    categoria: x.categoria,
    monto: x.monto,
    fecha: x.fecha,
    comentario: x.comentario,
    adjuntoUrl: x.adjuntoUrl,
    estado: x.estado,
    registradoPor: usuarioRef(x.registradoPorId),
    fechaCreacion: x.fechaCreacion,
  };
}

// ---------------------------------------------------------------- Archivos

// Una imagen subida se guarda como data: URL, reducida para que quepa en localStorage.
export async function imagenComoDataUrl(archivo: File, lado = 1280): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw fallo(400, 'El archivo debe ser una imagen');
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext('2d')!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();
  return lienzo.toDataURL('image/jpeg', 0.78);
}
