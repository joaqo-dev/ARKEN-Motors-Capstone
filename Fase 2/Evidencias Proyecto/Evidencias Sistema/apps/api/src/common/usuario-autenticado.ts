import type { RolUsuario } from '@vitriauto/shared-types';

// Datos del usuario derivados del JWT ya validado (nunca del body/query).
export interface UsuarioAutenticado {
  id: string;
  automotoraId: string;
  sucursalId: string | null;
  rol: RolUsuario;
}

export interface JwtPayload {
  sub: string;
  automotoraId: string;
  sucursalId: string | null;
  rol: RolUsuario;
}
