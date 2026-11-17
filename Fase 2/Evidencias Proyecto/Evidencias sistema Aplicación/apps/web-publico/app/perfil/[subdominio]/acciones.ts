'use server';

import { headers } from 'next/headers';
import { config } from '../../../lib/config';

export interface EstadoContacto {
  estado: 'inicial' | 'enviado' | 'error';
  mensaje?: string;
  errores?: Partial<Record<'nombre' | 'email' | 'mensaje', string>>;
  valores?: Record<string, string>;
}

const CAMPOS = ['nombre', 'email', 'telefono', 'sucursalId', 'mensaje', 'sitioWeb'] as const;

// Formulario de contacto de la vitrina: se envía desde el servidor de Next a la
// API (sin CORS ni cookies). Se reenvía la IP del visitante para que el límite
// de envíos de la API sea por persona y no por servidor.
export async function enviarContacto(
  subdominio: string,
  _previo: EstadoContacto,
  datos: FormData,
): Promise<EstadoContacto> {
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(datos.get(c) ?? '')]));

  const errores: EstadoContacto['errores'] = {};
  if (!valores.nombre!.trim()) errores.nombre = 'Cuéntanos tu nombre.';
  if (!/^\S+@\S+\.\S+$/.test(valores.email!.trim())) errores.email = 'Revisa tu correo.';
  if (valores.mensaje!.trim().length < 10) errores.mensaje = 'Escribe al menos 10 caracteres.';
  if (Object.keys(errores).length) return { estado: 'error', errores, valores };

  const ip = (await headers()).get('x-forwarded-for')?.split(',').pop()?.trim();
  let res: Response;
  try {
    res = await fetch(
      `${config.apiUrl}/publico/automotoras/${encodeURIComponent(subdominio)}/contacto`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}) },
        body: JSON.stringify(valores),
        cache: 'no-store',
      },
    );
  } catch {
    return {
      estado: 'error',
      mensaje: 'No pudimos conectarnos. Intenta de nuevo en unos segundos.',
      valores,
    };
  }
  if (res.ok) return { estado: 'enviado' };
  if (res.status === 429) {
    return {
      estado: 'error',
      mensaje: 'Enviaste varios mensajes seguidos. Espera unos minutos o escríbenos por WhatsApp.',
      valores,
    };
  }
  const cuerpo = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
  const detalle = Array.isArray(cuerpo?.message) ? cuerpo.message[0] : cuerpo?.message;
  return {
    estado: 'error',
    mensaje: detalle ?? 'No pudimos enviar tu mensaje. Intenta de nuevo o escríbenos por WhatsApp.',
    valores,
  };
}
