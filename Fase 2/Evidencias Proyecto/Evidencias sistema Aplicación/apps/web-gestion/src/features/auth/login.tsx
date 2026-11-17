import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFormulario } from '../../lib/formulario';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CLAVE_SESION, useSesion } from '../../auth/sesion';
import { api } from '../../lib/api';
import { Boton, Campo, Input } from '../../ui/componentes';
import { Alerta, MarcoAcceso } from './marco';

export function LoginPage() {
  const { usuario } = useSesion();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const desde = (useLocation().state as { desde?: string } | null)?.desde ?? '/';
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useFormulario<{
    email: string;
    password: string;
  }>();

  if (usuario) return <Navigate to={desde} replace />;

  const enviar = handleSubmit(async (datos) => {
    setError(null);
    try {
      await api('POST', '/auth/login', { body: datos, sinRefresh: true });
      await qc.invalidateQueries({ queryKey: CLAVE_SESION });
      navegar(desde, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  });

  return (
    <MarcoAcceso
      titulo="Iniciar sesión"
      subtitulo="Ingresa con el email y la contraseña de tu cuenta."
    >
      <form onSubmit={enviar} className="space-y-5">
        {error && <Alerta tipo="error">{error}</Alerta>}
        <Campo etiqueta="Email">
          <Input type="email" autoComplete="email" required autoFocus {...register('email')} />
        </Campo>
        <Campo etiqueta="Contraseña">
          <Input
            type="password"
            autoComplete="current-password"
            required
            {...register('password')}
          />
        </Campo>
        <Boton type="submit" className="w-full" cargando={formState.isSubmitting}>
          Ingresar
        </Boton>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-5 text-sm">
          <Link
            to="/olvide-password"
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
          >
            ¿Olvidaste tu contraseña?
          </Link>
          <Link
            to="/registro"
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
          >
            Registrar mi automotora
          </Link>
        </div>
      </form>
    </MarcoAcceso>
  );
}
