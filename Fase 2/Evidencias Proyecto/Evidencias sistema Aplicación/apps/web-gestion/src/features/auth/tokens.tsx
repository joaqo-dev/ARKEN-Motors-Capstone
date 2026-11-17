import { PASSWORD_REGEX } from '@vitriauto/shared-types';
import { useEffect, useRef, useState } from 'react';
import { useFormulario } from '../../lib/formulario';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Boton, Campo, Cargando, Input } from '../../ui/componentes';
import { Alerta, MarcoAcceso } from './marco';

const MENSAJE_PASSWORD = 'Mínimo 8 caracteres, con al menos una letra y un número';

// Link del correo de verificación: /verificar-email?token=...
export function VerificarEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [estado, setEstado] = useState<'verificando' | 'ok' | 'error'>('verificando');
  const [mensaje, setMensaje] = useState('');
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return; // el token es de un solo uso (StrictMode monta dos veces)
    enviado.current = true;
    api<{ mensaje: string }>('POST', '/auth/verificar-email', { body: { token }, sinRefresh: true })
      .then((r) => {
        setMensaje(r.mensaje);
        setEstado('ok');
      })
      .catch((err) => {
        setMensaje((err as Error).message);
        setEstado('error');
      });
  }, [token]);

  return (
    <MarcoAcceso titulo="Verificación de email">
      {estado === 'verificando' && <Cargando texto="Verificando…" variante="centro" />}
      {estado === 'ok' && (
        <>
          <Alerta tipo="exito">{mensaje}</Alerta>
          <Link
            to="/login"
            className="mt-6 block text-center text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
          >
            Iniciar sesión
          </Link>
        </>
      )}
      {estado === 'error' && (
        <>
          <Alerta tipo="error">{mensaje}</Alerta>
          <ReenviarVerificacion />
        </>
      )}
    </MarcoAcceso>
  );
}

function ReenviarVerificacion() {
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useFormulario<{ email: string }>();
  const enviar = handleSubmit(async ({ email }) => {
    const r = await api<{ mensaje: string }>('POST', '/auth/reenviar-verificacion', {
      body: { email },
      sinRefresh: true,
    }).catch((e: Error) => ({ mensaje: e.message }));
    setRespuesta(r.mensaje);
  });
  if (respuesta) return <p className="mt-4 text-sm text-slate-600">{respuesta}</p>;
  return (
    <form onSubmit={enviar} className="mt-4 space-y-3">
      <p className="text-sm text-slate-600">¿El enlace expiró? Te enviamos uno nuevo:</p>
      <Campo etiqueta="Email">
        <Input type="email" required {...register('email')} />
      </Campo>
      <Boton
        type="submit"
        variante="secundario"
        className="w-full"
        cargando={formState.isSubmitting}
      >
        Reenviar enlace
      </Boton>
    </form>
  );
}

// Definir contraseña con un token del correo (invitación o recuperación).
function FormularioPassword({ endpoint, textoBoton }: { endpoint: string; textoBoton: string }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const { register, handleSubmit, formState } = useFormulario<{
    password: string;
    confirmar: string;
  }>();

  const enviar = handleSubmit(async ({ password }) => {
    try {
      const r = await api<{ mensaje: string }>('POST', endpoint, {
        body: { token, password },
        sinRefresh: true,
      });
      setResultado({ ok: true, mensaje: r.mensaje });
    } catch (err) {
      setResultado({ ok: false, mensaje: (err as Error).message });
    }
  });

  if (resultado?.ok) {
    return (
      <>
        <Alerta tipo="exito">{resultado.mensaje}</Alerta>
        <Link
          to="/login"
          className="mt-6 block text-center text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
        >
          Iniciar sesión
        </Link>
      </>
    );
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      {resultado && <Alerta tipo="error">{resultado.mensaje}</Alerta>}
      <Campo
        etiqueta="Nueva contraseña"
        error={formState.errors.password?.message}
        ayuda={MENSAJE_PASSWORD}
      >
        <Input
          type="password"
          autoComplete="new-password"
          autoFocus
          {...register('password', {
            required: 'Obligatoria',
            pattern: { value: PASSWORD_REGEX, message: MENSAJE_PASSWORD },
          })}
        />
      </Campo>
      <Campo etiqueta="Repite la contraseña" error={formState.errors.confirmar?.message}>
        <Input
          type="password"
          autoComplete="new-password"
          {...register('confirmar', { validate: (v, d) => v === d.password || 'No coinciden' })}
        />
      </Campo>
      <Boton type="submit" className="w-full" cargando={formState.isSubmitting}>
        {textoBoton}
      </Boton>
    </form>
  );
}

export function AceptarInvitacionPage() {
  return (
    <MarcoAcceso
      titulo="Configura tu contraseña"
      subtitulo="Te invitaron al sistema de gestión. Define tu contraseña para empezar."
    >
      <FormularioPassword endpoint="/auth/aceptar-invitacion" textoBoton="Guardar contraseña" />
    </MarcoAcceso>
  );
}

export function RestablecerPasswordPage() {
  return (
    <MarcoAcceso
      titulo="Restablece tu contraseña"
      subtitulo="Por seguridad se cerrarán tus sesiones abiertas en otros dispositivos."
    >
      <FormularioPassword endpoint="/auth/restablecer-password" textoBoton="Cambiar contraseña" />
    </MarcoAcceso>
  );
}

export function OlvidePasswordPage() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useFormulario<{ email: string }>();
  const enviar = handleSubmit(async ({ email }) => {
    const r = await api<{ mensaje: string }>('POST', '/auth/olvide-password', {
      body: { email },
      sinRefresh: true,
    }).catch((e: Error) => ({ mensaje: e.message }));
    setMensaje(r.mensaje);
  });
  return (
    <MarcoAcceso
      titulo="¿Olvidaste tu contraseña?"
      subtitulo="Te enviaremos un enlace para restablecerla."
    >
      {mensaje ? (
        <Alerta tipo="info">{mensaje}</Alerta>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Campo etiqueta="Email">
            <Input type="email" required autoFocus {...register('email')} />
          </Campo>
          <Boton type="submit" className="w-full" cargando={formState.isSubmitting}>
            Enviar enlace
          </Boton>
        </form>
      )}
      <Link
        to="/login"
        className="mt-6 block text-center text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
      >
        Volver a iniciar sesión
      </Link>
    </MarcoAcceso>
  );
}
