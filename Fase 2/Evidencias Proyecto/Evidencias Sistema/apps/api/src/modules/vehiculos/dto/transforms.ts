import { normalizarNombreVehiculo } from '@vitriauto/shared-types';

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Campo opcional de texto: "" se guarda como null.
export const trimONull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const limpio = value.trim();
  return limpio === '' ? null : limpio;
};

export const MONTO_MAXIMO = 9_999_999_999.99; // NUMERIC(12, 2)

// Marca y modelo normalizados ("toyota HILUX" → "Toyota Hilux"): así los filtros
// y la analítica no los cuentan como distintos por mayúsculas o espacios.
export const nombreVehiculo = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizarNombreVehiculo(value) : value;
