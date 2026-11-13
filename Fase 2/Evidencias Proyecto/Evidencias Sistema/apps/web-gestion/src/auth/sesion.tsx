import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, ApiError, onSesionExpirada } from '../lib/api';
import type { Automotora, Usuario } from '../lib/tipos';
import { ContextoSesion, type Sesion } from './contextos';
import { Cargando } from '../ui/componentes';

const Contexto = ContextoSesion;

export const CLAVE_SESION = ['sesion'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  // La sesión vive en cookies httpOnly: se consulta a /auth/me (401 = sin sesión).
  const sesion = useQuery({
    queryKey: CLAVE_SESION,
    queryFn: async () => {
      try {
        const usuario = await api<Usuario>('GET', '/auth/me');
        const automotora = await api<Automotora>('GET', '/automotora');
        return { usuario, automotora };
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    onSesionExpirada(() => {
      qc.setQueryData(CLAVE_SESION, null);
    });
  }, [qc]);

  const usuario = sesion.data?.usuario ?? null;
  const valor: Sesion = {
    usuario,
    automotora: sesion.data?.automotora ?? null,
    cargando: sesion.isLoading,
    esGeneral: usuario?.rol === 'ADMIN_GENERAL',
    esAdmin: usuario !== null && usuario.rol !== 'VENDEDOR',
    cerrarSesion: async () => {
      await api('POST', '/auth/logout', { sinRefresh: true }).catch(() => undefined);
      // Primero se anula la sesión (sus observadores siguen suscritos) y luego se
      // descarta el resto de la caché; qc.clear() los dejaría con el usuario anterior.
      qc.setQueryData(CLAVE_SESION, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== CLAVE_SESION[0] });
    },
    refrescar: () => qc.invalidateQueries({ queryKey: CLAVE_SESION }),
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useSesion fuera de AuthProvider');
  return ctx;
}

// Usuario autenticado (solo dentro de rutas protegidas).
export function useUsuario(): Usuario {
  const { usuario } = useSesion();
  if (!usuario) throw new Error('Sin sesión');
  return usuario;
}

// Rutas protegidas: sin sesión, al login (volviendo luego a la ruta pedida).
export function RequiereSesion() {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();
  if (cargando) return <Cargando texto="Cargando sesión…" variante="centro" />;
  if (!usuario)
    return (
      <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />
    );
  return <Outlet />;
}

// Rutas por rol: sin permiso, al inicio.
export function RequiereRol({ admin, general }: { admin?: boolean; general?: boolean }) {
  const { esAdmin, esGeneral } = useSesion();
  if ((general && !esGeneral) || (admin && !esAdmin)) return <Navigate to="/" replace />;
  return <Outlet />;
}
