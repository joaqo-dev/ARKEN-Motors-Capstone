import { useQuery } from '@tanstack/react-query';
import { useContext, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Sucursal } from '../lib/tipos';
import { ContextoSucursal, type SucursalActiva } from './contextos';
import { useSesion } from './sesion';

const Contexto = ContextoSucursal;
const CLAVE = 'panel.sucursalActiva';

function leerGuardada(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

// Selector de sucursal de la barra superior (docs/04): el ADMIN_GENERAL elige
// "Todas" o una sucursal; ADMIN_SUCURSAL y VENDEDOR quedan fijos en la suya.
export function SucursalActivaProvider({ children }: { children: ReactNode }) {
  const { usuario, esGeneral } = useSesion();
  const [elegida, setElegida] = useState<string | null>(leerGuardada);

  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursales'],
    queryFn: () => api<Sucursal[]>('GET', '/sucursales'),
    enabled: !!usuario,
  });

  // Una sucursal guardada que ya no existe (dada de baja) vuelve a "Todas".
  const valida = elegida && sucursales.some((s) => s.id === elegida) ? elegida : null;
  const sucursalId = esGeneral ? valida : (usuario?.sucursalId ?? null);

  const valor: SucursalActiva = {
    sucursalId,
    setSucursalId: (id) => {
      setElegida(id);
      try {
        if (id) localStorage.setItem(CLAVE, id);
        else localStorage.removeItem(CLAVE);
      } catch {
        /* sin almacenamiento: solo se pierde la preferencia */
      }
    },
    sucursales,
    nombre: (id) => sucursales.find((s) => s.id === id)?.nombre ?? '—',
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSucursalActiva(): SucursalActiva {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useSucursalActiva fuera de SucursalActivaProvider');
  return ctx;
}
