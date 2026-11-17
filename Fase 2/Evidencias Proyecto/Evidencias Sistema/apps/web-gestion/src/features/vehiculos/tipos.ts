import type {
  Pendiente,
  RespaldoDocumentoLegal,
  TipoDocumentoLegal,
} from '@vitriauto/shared-types';
import { diasDesde } from '../../lib/formato';
export interface VehiculoListado {
  id: string;
  sucursal: { id: string; nombre: string };
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
  traccion: string | null; // null en motos
  descripcion: string | null;
  precioVenta: number;
  costoAdquisicion?: number; // no viene para el Vendedor
  origen: string;
  estado: string;
  fechaIngreso: string;
  fotoPortada: string | null;
  // Lo que un admin pidió corregir al devolverlo de revisión.
  observacionRevision: string | null;
  // Qué le falta: obligatorio para publicar y recomendado (Módulo 7.6).
  pendientes: Pendiente[];
}

export interface Foto {
  id: string;
  url: string;
  orden: number;
}

export interface DocumentoLegal {
  id: string;
  tipo: TipoDocumentoLegal;
  respaldo: RespaldoDocumentoLegal;
  fechaVencimiento: string;
  fechaPrimeraInscripcion: string | null;
  fechaCarga: string;
  cargadoPor: string;
  vigente: boolean;
  archivoUrl: string;
}

export interface ConsignacionResumen {
  id: string;
  folio: number;
  clienteId: string;
  // Solo admins (el trato es el margen de la automotora):
  tipoTrato?: 'COMISION_VENTA' | 'PRECIO_NETO';
  porcentajeComision?: number | null;
  montoNeto?: number | null;
  precioMinimo: number;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}

export interface VehiculoDetalle extends VehiculoListado {
  fotos: Foto[];
  documentosLegales: DocumentoLegal[];
  consignacion: ConsignacionResumen | null;
}

export interface EventoBitacora {
  id: string;
  tipoEvento: string;
  descripcion: string;
  fecha: string;
  usuario: { id: string; nombre: string };
}

export interface Gasto {
  id: string;
  numero: number;
  vehiculo: { id: string; patente: string; descripcion: string };
  sucursal: { id: string; nombre: string };
  categoria: string;
  monto: number;
  fecha: string;
  comentario: string | null;
  adjuntoUrl: string | null;
  estado: 'ACTIVO' | 'ANULADO';
  registradoPor: { id: string; nombre: string };
}

export type Balance =
  | {
      tipo: 'PROPIO';
      margenTipo: 'REAL' | 'PROYECTADO';
      precioVenta: number;
      costoAdquisicion: number;
      totalGastos: number;
      costoTotal: number;
      margen: number;
    }
  | {
      tipo: 'CONSIGNACION';
      margenTipo: 'REAL' | 'PROYECTADO';
      precioVenta: number;
      comision: number;
      montoConsignante: number;
      margen: number;
    };

export const descripcionVehiculo = (v: {
  marca: string;
  modelo: string;
  anio: number;
  version?: string | null;
}) => `${v.marca} ${v.modelo}${v.version ? ` ${v.version}` : ''} ${v.anio}`;

// Días calendario (de Chile) desde el ingreso al inventario. La API guarda el ingreso a
// mediodía; restar milisegundos desde ese instante daba un día menos (y -1 el mismo día) en las mañanas.
export const diasEnStock = (fechaIngreso: string) => diasDesde(fechaIngreso);
