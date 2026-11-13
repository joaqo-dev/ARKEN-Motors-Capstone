import type { RolUsuario } from '@vitriauto/shared-types';

// Formas de las respuestas de la API usadas en el panel.

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  sucursalId: string | null;
  automotoraId: string;
  estado: 'ACTIVO' | 'INACTIVO';
  emailVerificado: boolean;
  invitacionPendiente: boolean;
  fechaCreacion: string;
}

export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  region: string;
  comuna: string;
  telefono: string;
  encargado: string | null;
  horarioAtencion: string | null;
  whatsapp: string | null;
  esPrincipal: boolean;
  fechaCreacion: string;
}

export interface Automotora {
  id: string;
  nombre: string;
  rut: string;
  subdominio: string;
  direccion: string;
  telefono: string;
  email: string;
  descripcion: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  diasValidezCotizacion: number;
  diasValidezReserva: number;
  diasValidezTasacion: number;
  correos: ConfigCorreos;
  financiamiento: ConfigFinanciamiento;
}

// Simulador de crédito de la ficha pública. tasaMensual en % mensual.
export interface ConfigFinanciamiento {
  activo: boolean;
  tasaMensual: number | null;
  pieMinimo: number;
  plazoMaximo: number;
}

// Correos al cliente: PDF al emitir por tipo y días de cada recordatorio
// (null = no se envía).
export interface ConfigCorreos {
  cotizacion: boolean;
  reserva: boolean;
  tasacion: boolean;
  venta: boolean;
  consignacion: boolean;
  diasSeguimientoCotizacion: number | null;
  diasAvisoCotizacion: number | null;
  diasAvisoReserva: number | null;
  diasAvisoTasacion: number | null;
}

export type TipoDocumentoCorreo = 'COTIZACION' | 'RESERVA' | 'TASACION' | 'VENTA' | 'CONSIGNACION';

export interface Correo {
  id: string;
  tipo:
    | 'DOCUMENTO'
    | 'SEGUIMIENTO_COTIZACION'
    | 'COTIZACION_POR_VENCER'
    | 'RESERVA_POR_VENCER'
    | 'TASACION_POR_VENCER';
  destinatario: string;
  estado: 'PENDIENTE' | 'ENVIADO' | 'FALLIDO' | 'DESCARTADO';
  intentos: number;
  error: string | null;
  fechaCreacion: string;
  fechaEnvio: string | null;
  pedidoPor: string | null;
}

export interface Pagina<T> {
  items: T[];
  total: number;
}

export interface Ref {
  id: string;
  nombre: string;
}
