import type { Automotora, Sucursal, Usuario } from '../lib/tipos';
import type { Cliente } from '../features/clientes/tipos';
import type { DocumentoLegal, Foto } from '../features/vehiculos/tipos';
import type { SeccionInspeccionDetalle } from '../features/inspecciones/tipos';
import { crearDatos } from './datos';

export type DocumentoLegalDemo = DocumentoLegal & { cargadoPorId: string };

// Base de datos de la demo: un objeto en memoria que se guarda entero en
// localStorage después de cada cambio. "Reiniciar demo" vuelve a los datos de
// ejemplo (crearDatos), con fechas relativas al día en que se reinicia.

export interface FilaSucursal extends Sucursal {
  automotoraId: string;
  activa: boolean;
}

export interface FilaCliente extends Cliente {
  automotoraId: string;
}

export interface FilaVehiculo {
  id: string;
  // Lo que un admin pidió corregir al devolverlo de revisión.
  observacionRevision?: string | null;
  automotoraId: string;
  sucursalId: string;
  marca: string;
  modelo: string;
  anio: number;
  version: string | null;
  kilometraje: number;
  color: string;
  combustible: string;
  transmision: string;
  cilindrada: string | null;
  patente: string;
  categoria: string;
  traccion: string | null;
  descripcion: string | null;
  precioVenta: number;
  costoAdquisicion: number;
  origen: string;
  estado: string;
  fechaIngreso: string;
  fotos: Foto[];
  documentos: DocumentoLegalDemo[]; // vigentes e historial
}

export interface FilaConsignacion {
  id: string;
  folio: number;
  automotoraId: string;
  vehiculoId: string;
  clienteId: string;
  tipoTrato: 'COMISION_VENTA' | 'PRECIO_NETO';
  porcentajeComision: number | null;
  montoNeto: number | null;
  precioMinimo: number;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  sucursalRegistroId: string;
  fechaCreacion: string;
}

export interface Anulacion {
  motivo: string;
  fecha: string | null;
}

export interface FilaCotizacion {
  id: string;
  folio: number;
  automotoraId: string;
  sucursalId: string; // sucursal fijada al emitir
  clienteId: string;
  vehiculoId: string;
  precioCotizado: number;
  costosAdicionales: { descripcion: string; monto: number }[];
  vigenciaDias: number;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  ventaId: string | null;
  emitidaPorId: string;
  anulacion: Anulacion | null;
}

export interface FilaReserva {
  id: string;
  folio: number;
  automotoraId: string;
  sucursalId: string;
  clienteId: string;
  vehiculoId: string;
  montoReserva: number;
  condicionesDevolucion: string | null;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  emitidaPorId: string;
  cancelacion: (Anulacion & { senaRetenida: boolean }) | null;
  estadoVehiculoPrevio: string;
}

export interface FilaVenta {
  id: string;
  folio: number;
  automotoraId: string;
  sucursalId: string;
  clienteId: string;
  vehiculoId: string;
  precioVentaFinal: number;
  precioPublicado: number; // para el descuento promedio (Analítica)
  reservaId: string | null;
  senaDescontada: number;
  cotizacionId: string | null;
  formasPago: { tipo: string; monto: number; vehiculoRecibidoId: string | null }[];
  costosAdicionales: { descripcion: string; monto: number }[];
  fechaVenta: string;
  estado: 'CONFIRMADA' | 'ANULADA';
  vendidaPorId: string;
  anulacion: Anulacion | null;
  margen: number;
  liquidacion: { precioVenta: number; comision: number; montoConsignante: number } | null;
}

export interface FilaTasacion {
  id: string;
  folio: number;
  automotoraId: string;
  sucursalId: string;
  clienteId: string;
  vehiculoTasado: {
    patente: string;
    marca: string;
    modelo: string;
    version: string | null;
    anio: number;
    kilometraje: number;
    estadoGeneral: string;
  };
  ofertaMonto: number;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  emitidaPorId: string;
  vehiculoCreadoId: string | null;
  anulacion: Anulacion | null;
}

export interface FilaGasto {
  id: string;
  numero: number;
  automotoraId: string;
  tipo: 'VEHICULO' | 'OPERACIONAL';
  vehiculoId: string | null;
  sucursalId: string | null; // null = general de la automotora
  categoria: string;
  monto: number;
  fecha: string;
  comentario: string | null;
  adjuntoUrl: string | null;
  estado: 'ACTIVO' | 'ANULADO';
  registradoPorId: string;
  fechaCreacion: string;
}

export interface FilaBitacora {
  id: string;
  vehiculoId: string;
  tipoEvento: string;
  descripcion: string;
  fecha: string;
  usuarioId: string;
}

export interface FilaNotificacion {
  id: string;
  automotoraId: string;
  tipo: string;
  mensaje: string;
  sucursalId: string;
  fechaGeneracion: string;
  estado: 'PENDIENTE' | 'RESUELTA';
  fechaResolucion: string | null;
  referencias: { tipo: 'VEHICULO' | 'RESERVA' | 'CONSIGNACION'; id: string }[];
}

export interface FilaAuditoria {
  id: string;
  automotoraId: string;
  fecha: string;
  usuarioId: string;
  sucursalId: string | null;
  accion: string;
  entidad: { tipo: string; id: string };
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
}

export interface FilaInspeccion {
  id: string;
  vehiculoId: string;
  estado: 'BORRADOR' | 'FINALIZADA';
  resultado: 'APROBADO' | 'APROBADO_CON_OBSERVACIONES' | 'NO_APROBADO' | null;
  kilometraje: number;
  observaciones: string | null;
  fechaCreacion: string;
  fechaFinalizacion: string | null;
  iniciadaPorId: string;
  finalizadaPorId: string | null;
  secciones: SeccionInspeccionDetalle[];
}

export interface FilaCorreo {
  id: string;
  documentoTipo: string;
  documentoId: string;
  destinatario: string;
  fechaCreacion: string;
  pedidoPor: string | null;
}

export interface Db {
  version: number;
  automotoras: Automotora[];
  sucursales: FilaSucursal[];
  usuarios: Usuario[];
  clientes: FilaCliente[];
  vehiculos: FilaVehiculo[];
  consignaciones: FilaConsignacion[];
  cotizaciones: FilaCotizacion[];
  reservas: FilaReserva[];
  ventas: FilaVenta[];
  tasaciones: FilaTasacion[];
  gastos: FilaGasto[];
  bitacora: FilaBitacora[];
  notificaciones: FilaNotificacion[];
  auditoria: FilaAuditoria[];
  inspecciones: FilaInspeccion[];
  correos: FilaCorreo[];
  folios: Record<string, number>; // `${automotoraId}:${tipo}` -> último folio
}

// Sube la versión si cambia la forma de los datos: lo guardado se descarta.
export const VERSION_DATOS = 1;
const CLAVE_DATOS = 'vitriauto-demo.datos';
const CLAVE_PERFIL = 'vitriauto-demo.perfil';

// Perfiles para recorrer la demo con distintos roles y automotoras.
export const PERFILES = [
  { usuarioId: 'usr-aromos-camila', texto: 'Admin general · Los Aromos' },
  { usuarioId: 'usr-aromos-diego', texto: 'Admin de sucursal · Los Aromos Maipú' },
  { usuarioId: 'usr-aromos-valentina', texto: 'Vendedora · Los Aromos Las Condes' },
  { usuarioId: 'usr-pacifico-tomas', texto: 'Admin general · Pacífico Motors' },
  { usuarioId: 'usr-austral-fernanda', texto: 'Admin general · Austral Autos' },
] as const;

function leer(): Db | null {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_DATOS) ?? 'null') as Db | null;
    return guardado?.version === VERSION_DATOS ? guardado : null;
  } catch {
    return null;
  }
}

let db: Db = leer() ?? crearDatos();

export const datos = () => db;

// Vuelve a una copia anterior (una acción que falló a medias).
export function restaurar(copia: Db) {
  db = copia;
}

// Guarda todo el estado. Si no cabe (fotos subidas), se avisa al usuario.
export function guardar(): boolean {
  try {
    localStorage.setItem(CLAVE_DATOS, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function perfilActual(): string {
  try {
    const id = localStorage.getItem(CLAVE_PERFIL);
    if (id && PERFILES.some((p) => p.usuarioId === id)) return id;
  } catch {
    /* sin almacenamiento: perfil por defecto */
  }
  return PERFILES[0].usuarioId;
}

// Cambia de perfil y recarga en el inicio (la caché de la sesión anterior no sirve).
export function cambiarPerfil(usuarioId: string) {
  try {
    localStorage.setItem(CLAVE_PERFIL, usuarioId);
    localStorage.removeItem('panel.sucursalActiva');
  } catch {
    /* sin almacenamiento: el cambio dura hasta recargar */
  }
  recargarEnInicio();
}

// Vuelve a los datos de ejemplo y borra las preferencias guardadas del panel.
export function reiniciarDemo() {
  db = crearDatos();
  try {
    localStorage.removeItem(CLAVE_DATOS);
    localStorage.removeItem('panel.sucursalActiva');
    for (const clave of Object.keys(sessionStorage)) {
      if (clave.startsWith('panel.')) sessionStorage.removeItem(clave);
    }
  } catch {
    /* sin almacenamiento: no había nada guardado */
  }
  recargarEnInicio();
}

function recargarEnInicio() {
  window.location.hash = '#/';
  window.location.reload();
}
