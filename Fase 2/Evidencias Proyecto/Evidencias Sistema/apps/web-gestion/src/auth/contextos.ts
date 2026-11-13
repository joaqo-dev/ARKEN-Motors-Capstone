import { createContext } from 'react';
import type { Automotora, Sucursal, Usuario } from '../lib/tipos';

// Contextos en un módulo propio: si Vite recarga en caliente sesion.tsx o
// sucursal-activa.tsx, el objeto de contexto no cambia y la página no pierde
// su proveedor.

export interface Sesion {
  usuario: Usuario | null;
  automotora: Automotora | null;
  cargando: boolean;
  esGeneral: boolean; // ADMIN_GENERAL
  esAdmin: boolean; // ADMIN_GENERAL o ADMIN_SUCURSAL (el Vendedor no ve costos ni administra)
  cerrarSesion: () => Promise<void>;
  refrescar: () => Promise<unknown>;
}
export const ContextoSesion = createContext<Sesion | null>(null);

export interface SucursalActiva {
  // null = "Todas" (solo ADMIN_GENERAL). Para los demás roles, siempre su sucursal.
  sucursalId: string | null;
  setSucursalId: (id: string | null) => void;
  sucursales: Sucursal[];
  nombre: (id: string | null | undefined) => string;
}
export const ContextoSucursal = createContext<SucursalActiva | null>(null);

export type TipoAviso = 'exito' | 'error';
export const ContextoAviso = createContext<(texto: string, tipo?: TipoAviso) => void>(
  () => undefined,
);
