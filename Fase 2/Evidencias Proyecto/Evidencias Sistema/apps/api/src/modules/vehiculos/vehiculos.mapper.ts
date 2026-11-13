import { pendientesVehiculo, type RolUsuario } from '@vitriauto/shared-types';
import { tratoDeFila, type ConsignacionRow } from '../consignaciones/consignaciones.repository';
import type { DocumentoLegalRow } from './documentos-legales.repository';
import type { FotoRow } from './vehiculo-fotos.repository';
import type { VehiculoListadoRow } from './vehiculos.repository';

// El VENDEDOR no ve costos de adquisición ni márgenes: ni el costo del
// vehículo ni la comisión de una consignación.
const veCostos = (rol: RolUsuario) => rol !== 'VENDEDOR';

export function toVehiculoResponse(row: VehiculoListadoRow, rol: RolUsuario) {
  return {
    id: row.id,
    sucursal: { id: row.sucursal_id, nombre: row.sucursal_nombre },
    marca: row.marca,
    modelo: row.modelo,
    anio: row.anio,
    version: row.version,
    kilometraje: row.kilometraje,
    color: row.color,
    combustible: row.combustible,
    transmision: row.transmision,
    cilindrada: row.cilindrada,
    patente: row.patente,
    categoria: row.categoria,
    traccion: row.traccion,
    descripcion: row.descripcion,
    precioVenta: Number(row.precio_venta),
    ...(veCostos(rol) ? { costoAdquisicion: Number(row.costo_adquisicion) } : {}),
    origen: row.origen,
    estado: row.estado,
    fechaIngreso: row.fecha_ingreso,
    fotoPortada: row.foto_portada,
    observacionRevision: row.observacion_revision,
    // Qué le falta: obligatorio para publicar y recomendado.
    pendientes: pendientesVehiculo({
      fotos: row.fotos_cantidad,
      version: row.version,
      cilindrada: row.cilindrada,
      combustible: row.combustible,
      descripcion: row.descripcion,
      documentos: row.documentos_vigentes,
      inspeccionAprobada: row.inspeccion_aprobada,
    }),
  };
}

export function toFotoResponse(row: FotoRow) {
  return { id: row.id, url: row.url, orden: row.orden };
}

export function toDocumentoResponse(row: DocumentoLegalRow) {
  return {
    id: row.id,
    tipo: row.tipo,
    respaldo: row.respaldo,
    fechaVencimiento: row.fecha_vencimiento,
    fechaPrimeraInscripcion: row.fecha_primera_inscripcion,
    fechaCarga: row.fecha_carga,
    cargadoPor: row.cargado_por_nombre,
    vigente: row.vigente,
    // Archivo privado: se descarga por la API, con sesión y scope.
    archivoUrl: `/vehiculos/${row.vehiculo_id}/documentos/${row.id}/archivo`,
  };
}

export function toConsignacionResumen(row: ConsignacionRow, rol: RolUsuario) {
  return {
    id: row.id,
    folio: row.folio,
    clienteId: row.cliente_id,
    // El trato (su % o su neto) es el margen de la automotora: solo admins.
    ...(veCostos(rol) ? tratoDeFila(row) : {}),
    precioMinimo: Number(row.precio_minimo),
    fechaInicio: row.fecha_inicio,
    fechaFin: row.fecha_fin,
    estado: row.estado,
  };
}
