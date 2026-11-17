import { ApiError, qs } from '../lib/api';
import { datos, guardar, restaurar } from './db';
import { atender } from './servidor';

// Modo demo: reemplaza al cliente HTTP del panel (src/lib/api.ts) con la misma
// firma. Las requests las atiende el "servidor" en memoria y cada cambio se
// guarda en localStorage. No hay red, cookies ni tokens.

export { ApiError, qs };

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Opciones {
  body?: unknown;
  sinRefresh?: boolean;
}

// En la demo la sesión no expira.
export function onSesionExpirada(_fn: () => void) {}

// Una pequeña espera para que los estados de carga se vean como en el panel real.
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function api<T>(metodo: Metodo, ruta: string, opciones: Opciones = {}): Promise<T> {
  await espera(metodo === 'GET' ? 120 : 220);
  // Si la acción falla a medias, los datos vuelven a como estaban.
  const copia = metodo === 'GET' ? null : structuredClone(datos());
  try {
    const resultado = await atender(metodo, ruta, opciones.body);
    if (copia && !guardar()) {
      throw new ApiError(
        507,
        'El cambio se aplicó, pero este navegador no tiene espacio para guardarlo (las fotos ocupan mucho). Usa "Reiniciar demo" para liberar espacio.',
      );
    }
    // Copia: lo que el panel guarde en caché no comparte objetos con la "base de datos".
    return (resultado === undefined ? undefined : structuredClone(resultado)) as T;
  } catch (err) {
    if (copia && !(err instanceof ApiError && err.status === 507)) restaurar(copia);
    if (err instanceof ApiError) throw err;
    console.error(err);
    throw new ApiError(500, 'Error inesperado en la demo');
  }
}
