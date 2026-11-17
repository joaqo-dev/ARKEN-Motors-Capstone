import { headers } from 'next/headers';

// Subdominio de la vitrina desde la que se navega (lo fija middleware.ts), o
// null en el marketplace del dominio raíz.
export async function vitrinaActual(): Promise<string | null> {
  return (await headers()).get('x-vitrina');
}
