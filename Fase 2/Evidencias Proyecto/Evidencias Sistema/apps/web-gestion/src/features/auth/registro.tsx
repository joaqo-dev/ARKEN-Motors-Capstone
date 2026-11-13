import {
  esRutValido,
  esSubdominioValido,
  PASSWORD_REGEX,
  REGIONES_CHILE,
} from '@vitriauto/shared-types';
import { useEffect, useState } from 'react';
import { InputRut } from '../../ui/rut';
import { useFormulario } from '../../lib/formulario';
import { Link } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { DOMINIO_PUBLICO, urlSitio } from '../../lib/config';
import { Boton, Campo, Input, Select } from '../../ui/componentes';
import { Alerta, MarcoAcceso } from './marco';

interface Datos {
  nombre: string;
  rut: string;
  direccion: string;
  region: string;
  comuna: string;
  telefono: string;
  email: string;
  subdominio: string;
  adminNombre: string;
  adminEmail: string;
  password: string;
  confirmar: string;
  aceptaTerminos: boolean;
}

const MENSAJE_PASSWORD = 'Mínimo 8 caracteres, con al menos una letra y un número';

// Registro público de una automotora: crea automotora + casa matriz + usuario
// Admin General. Hay que verificar el email antes de iniciar sesión.
export function RegistroPage() {
  const [enviado, setEnviado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState } = useFormulario<Datos>({
    defaultValues: { region: 'METROPOLITANA' },
  });
  const errores = formState.errors;

  // Disponibilidad del subdominio mientras se escribe.
  const subdominio = watch('subdominio')?.trim().toLowerCase() ?? '';
  const [disponibilidad, setDisponibilidad] = useState<string | null>(null);
  useEffect(() => {
    if (!subdominio) return setDisponibilidad(null);
    if (!esSubdominioValido(subdominio))
      return setDisponibilidad('Solo minúsculas, números y guiones (3 a 63 caracteres)');
    const t = setTimeout(async () => {
      const r = await api<{ disponible: boolean; motivo?: string }>(
        'GET',
        `/auth/subdominio-disponible${qs({ subdominio })}`,
      ).catch(() => null);
      setDisponibilidad(
        !r
          ? null
          : r.disponible
            ? 'disponible'
            : r.motivo === 'RESERVADO'
              ? 'Ese subdominio está reservado'
              : 'Ese subdominio ya está en uso',
      );
    }, 400);
    return () => clearTimeout(t);
  }, [subdominio]);

  const enviar = handleSubmit(async (d) => {
    setError(null);
    try {
      await api('POST', '/auth/registro-automotora', {
        sinRefresh: true,
        body: {
          automotora: {
            nombre: d.nombre,
            rut: d.rut,
            direccion: d.direccion,
            region: d.region,
            comuna: d.comuna,
            telefono: d.telefono,
            email: d.email,
            subdominio: d.subdominio,
          },
          admin: { nombre: d.adminNombre, email: d.adminEmail, password: d.password },
          aceptaTerminos: d.aceptaTerminos,
        },
      });
      setEnviado(d.adminEmail);
    } catch (err) {
      setError((err as Error).message);
    }
  });

  if (enviado) {
    return (
      <MarcoAcceso titulo="¡Automotora registrada!">
        <Alerta tipo="exito">
          Te enviamos un correo a <strong>{enviado}</strong> para verificar tu email. Después de
          verificarlo podrás iniciar sesión.
        </Alerta>
        <Link
          to="/login"
          className="mt-6 block text-center text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
        >
          Ir a iniciar sesión
        </Link>
      </MarcoAcceso>
    );
  }

  return (
    <MarcoAcceso
      titulo="Registra tu automotora"
      subtitulo="Activación inmediata. Tu vitrina pública quedará en tu propio subdominio."
      ancho="max-w-2xl"
    >
      <form onSubmit={enviar} className="space-y-8">
        {error && <Alerta tipo="error">{error}</Alerta>}
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-[0.9375rem] font-semibold text-slate-900">
            Datos de la automotora
          </legend>
          <Campo etiqueta="Nombre" error={errores.nombre?.message}>
            <Input {...register('nombre', { required: 'Obligatorio' })} />
          </Campo>
          <Campo etiqueta="RUT" error={errores.rut?.message}>
            <InputRut
              placeholder="76.123.456-7"
              {...register('rut', {
                required: 'Obligatorio',
                validate: (v) => esRutValido(v) || 'RUT inválido: revisa el dígito verificador',
              })}
            />
          </Campo>
          <Campo
            etiqueta="Dirección de la casa matriz"
            error={errores.direccion?.message}
            className="sm:col-span-2"
          >
            <Input {...register('direccion', { required: 'Obligatorio' })} />
          </Campo>
          <Campo etiqueta="Región">
            <Select {...register('region')}>
              {Object.entries(REGIONES_CHILE).map(([codigo, nombre]) => (
                <option key={codigo} value={codigo}>
                  {nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Comuna" error={errores.comuna?.message}>
            <Input {...register('comuna', { required: 'Obligatorio' })} />
          </Campo>
          <Campo etiqueta="Teléfono" error={errores.telefono?.message}>
            <Input
              placeholder="+56 2 2345 6789"
              {...register('telefono', { required: 'Obligatorio' })}
            />
          </Campo>
          <Campo etiqueta="Email de la empresa" error={errores.email?.message}>
            <Input type="email" {...register('email', { required: 'Obligatorio' })} />
          </Campo>
          <Campo
            etiqueta="Subdominio (no se puede cambiar después)"
            className="sm:col-span-2"
            error={
              disponibilidad && disponibilidad !== 'disponible'
                ? disponibilidad
                : errores.subdominio?.message
            }
            ayuda={
              disponibilidad === 'disponible' ? (
                <span className="font-medium text-slate-900">
                  Disponible: {subdominio}.{DOMINIO_PUBLICO}
                </span>
              ) : (
                'Ej: automotora-perez'
              )
            }
          >
            <Input {...register('subdominio', { required: 'Obligatorio' })} />
          </Campo>
        </fieldset>
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-[0.9375rem] font-semibold text-slate-900">
            Tu cuenta (Admin General)
          </legend>
          <Campo etiqueta="Tu nombre" error={errores.adminNombre?.message}>
            <Input {...register('adminNombre', { required: 'Obligatorio' })} />
          </Campo>
          <Campo etiqueta="Tu email (para iniciar sesión)" error={errores.adminEmail?.message}>
            <Input
              type="email"
              autoComplete="email"
              {...register('adminEmail', { required: 'Obligatorio' })}
            />
          </Campo>
          <Campo etiqueta="Contraseña" error={errores.password?.message} ayuda={MENSAJE_PASSWORD}>
            <Input
              type="password"
              autoComplete="new-password"
              {...register('password', {
                required: 'Obligatorio',
                pattern: { value: PASSWORD_REGEX, message: MENSAJE_PASSWORD },
              })}
            />
          </Campo>
          <Campo etiqueta="Repite la contraseña" error={errores.confirmar?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              {...register('confirmar', {
                validate: (v, d) => v === d.password || 'Las contraseñas no coinciden',
              })}
            />
          </Campo>
        </fieldset>
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-600">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 cursor-pointer rounded"
              aria-invalid={Boolean(errores.aceptaTerminos)}
              aria-describedby={errores.aceptaTerminos ? 'error-terminos' : undefined}
              {...register('aceptaTerminos', {
                required: 'Debes aceptarlos para registrar tu automotora',
              })}
            />
            <span>
              Acepto los{' '}
              <a
                href={urlSitio('/terminos')}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
              >
                Términos de uso
              </a>{' '}
              y la{' '}
              <a
                href={urlSitio('/privacidad')}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
              >
                Política de privacidad
              </a>
              , y declaro que puedo aceptarlos en nombre de la automotora. Sus clientes que registre
              serán tratados según esa política.
            </span>
          </label>
          {errores.aceptaTerminos && (
            <p id="error-terminos" className="mt-1.5 pl-7 text-sm text-red-600">
              {errores.aceptaTerminos.message}
            </p>
          )}
        </div>
        <Boton
          type="submit"
          className="w-full"
          cargando={formState.isSubmitting}
          disabled={disponibilidad !== null && disponibilidad !== 'disponible'}
        >
          Registrar automotora
        </Boton>
        <p className="text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link
            to="/login"
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
          >
            Inicia sesión
          </Link>
        </p>
      </form>
    </MarcoAcceso>
  );
}
