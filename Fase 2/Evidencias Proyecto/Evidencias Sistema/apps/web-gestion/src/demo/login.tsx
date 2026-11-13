import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CLAVE_SESION } from '../auth/sesion';
import { Cargando } from '../ui/componentes';

// Modo demo: no hay pantalla de login. Se entra directo con el perfil de
// ejemplo elegido (también después de "Cerrar sesión").
export function LoginPage() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const desde = (ubicacion.state as { desde?: string } | null)?.desde ?? '/';

  useEffect(() => {
    qc.invalidateQueries({ queryKey: CLAVE_SESION }).then(() => navegar(desde, { replace: true }));
  }, [qc, navegar, desde]);

  return <Cargando texto="Entrando a la demo…" variante="centro" />;
}
