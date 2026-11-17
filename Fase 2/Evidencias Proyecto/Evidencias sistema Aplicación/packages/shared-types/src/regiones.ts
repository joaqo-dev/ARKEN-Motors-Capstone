import { z } from 'zod';

// Espejo del enum region_chile de docs/schema.sql, con su nombre para mostrar.
export const REGIONES_CHILE = {
  ARICA_PARINACOTA: 'Arica y Parinacota',
  TARAPACA: 'Tarapacá',
  ANTOFAGASTA: 'Antofagasta',
  ATACAMA: 'Atacama',
  COQUIMBO: 'Coquimbo',
  VALPARAISO: 'Valparaíso',
  METROPOLITANA: 'Metropolitana de Santiago',
  OHIGGINS: "Libertador General Bernardo O'Higgins",
  MAULE: 'Maule',
  NUBLE: 'Ñuble',
  BIOBIO: 'Biobío',
  ARAUCANIA: 'La Araucanía',
  LOS_RIOS: 'Los Ríos',
  LOS_LAGOS: 'Los Lagos',
  AYSEN: 'Aysén del General Carlos Ibáñez del Campo',
  MAGALLANES: 'Magallanes y de la Antártica Chilena',
} as const;

export const RegionChile = z.enum(
  Object.keys(REGIONES_CHILE) as [keyof typeof REGIONES_CHILE, ...(keyof typeof REGIONES_CHILE)[]],
);
export type RegionChile = z.infer<typeof RegionChile>;
