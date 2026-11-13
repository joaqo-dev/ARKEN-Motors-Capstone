import { PASSWORD_MIN_LENGTH } from '@vitriauto/shared-types';

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const MENSAJE_PASSWORD = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres, con al menos una letra y un número`;
