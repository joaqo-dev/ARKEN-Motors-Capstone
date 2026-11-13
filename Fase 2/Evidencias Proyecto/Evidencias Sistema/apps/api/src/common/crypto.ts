import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Token aleatorio para links de correo y refresh tokens (el valor real nunca se guarda).
export function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

// Hash determinista para poder buscar el token en BD (token_accion, sesion).
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function igualesTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
