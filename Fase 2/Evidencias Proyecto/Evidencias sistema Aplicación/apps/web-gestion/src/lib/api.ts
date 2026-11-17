import { API_URL } from './config';

// Error de la API con el formato del GlobalExceptionFilter.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

function leerCookie(nombre: string): string | null {
  const par = document.cookie.split('; ').find((c) => c.startsWith(`${nombre}=`));
  return par ? decodeURIComponent(par.slice(nombre.length + 1)) : null;
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Opciones {
  body?: unknown; // JSON o FormData
  // Sin renovación automática de sesión (endpoints de auth).
  sinRefresh?: boolean;
}

let refrescando: Promise<boolean> | null = null;

// Renueva el access token con el refresh token (cookie). Una sola renovación
// en curso aunque fallen varias requests a la vez.
function refrescarSesion(): Promise<boolean> {
  refrescando ??= fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': leerCookie('csrf_token') ?? '' },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refrescando = null;
    });
  return refrescando;
}

// Se ejecuta cuando la sesión no se puede renovar (ver AuthProvider).
let alExpirarSesion: () => void = () => undefined;
export function onSesionExpirada(fn: () => void) {
  alExpirarSesion = fn;
}

// Cliente HTTP único: cookies de sesión (credentials: 'include') y header CSRF
// (patrón doble cookie) en toda request que modifica datos.
export async function api<T>(metodo: Metodo, ruta: string, opciones: Opciones = {}): Promise<T> {
  const ejecutar = () => {
    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;
    if (opciones.body instanceof FormData) {
      body = opciones.body;
    } else if (opciones.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opciones.body);
    }
    if (metodo !== 'GET') headers['X-CSRF-Token'] = leerCookie('csrf_token') ?? '';
    return fetch(`${API_URL}${ruta}`, { method: metodo, credentials: 'include', headers, body });
  };

  let res: Response;
  try {
    res = await ejecutar();
    if (res.status === 401 && !opciones.sinRefresh) {
      if (await refrescarSesion()) {
        res = await ejecutar();
      } else {
        alExpirarSesion();
      }
    }
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  if (res.status === 204) return undefined as T;
  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    const mensaje = datos?.message;
    throw new ApiError(
      res.status,
      Array.isArray(mensaje) ? mensaje.join('. ') : (mensaje ?? `Error ${res.status}`),
    );
  }
  return datos as T;
}

// Query string ignorando valores vacíos.
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
