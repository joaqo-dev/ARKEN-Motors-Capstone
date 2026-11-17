import type { UsuarioAutenticado } from './usuario-autenticado';

export interface Scope {
  automotoraId: string;
  sucursalId: string | null; // null solo si rol = ADMIN_GENERAL
}

export function getScope(usuario: UsuarioAutenticado): Scope {
  return {
    automotoraId: usuario.automotoraId,
    sucursalId: usuario.rol === 'ADMIN_GENERAL' ? null : usuario.sucursalId,
  };
}
