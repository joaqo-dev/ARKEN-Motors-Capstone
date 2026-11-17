import { z } from 'zod';

// Enums espejo de los tipos nativos de docs/schema.sql.
export const RolUsuario = z.enum(['ADMIN_GENERAL', 'ADMIN_SUCURSAL', 'VENDEDOR']);
export type RolUsuario = z.infer<typeof RolUsuario>;

export const EstadoUsuario = z.enum(['ACTIVO', 'INACTIVO']);
export type EstadoUsuario = z.infer<typeof EstadoUsuario>;

export * from './validaciones';
export * from './vehiculos';
export * from './consignaciones';
export * from './regiones';
export * from './seo';
export * from './inspeccion';
export * from './financiamiento';
export * from './documentos-legales';
export * from './vehiculos-pendientes';
export * from './legal';
