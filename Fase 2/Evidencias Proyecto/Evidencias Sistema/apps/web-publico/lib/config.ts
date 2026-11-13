// Validación central de variables de entorno (falla al arrancar si falta una).
function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor.replace(/\/$/, '');
}

export const config = {
  // Solo en el servidor (SSR).
  get apiUrl() {
    return requerida('API_URL', process.env.API_URL);
  },
  publicApiUrl: requerida('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL),
  rootDomain: requerida('NEXT_PUBLIC_ROOT_DOMAIN', process.env.NEXT_PUBLIC_ROOT_DOMAIN),
  // Panel de gestión (opcional): para invitar a las automotoras a registrarse.
  panelUrl: process.env.NEXT_PUBLIC_PANEL_URL?.replace(/\/$/, '') || null,
};

// En desarrollo (localhost) se usa http; en producción, https.
export function urlPerfil(subdominio: string): string {
  const protocolo = config.rootDomain.includes('localhost') ? 'http' : 'https';
  return `${protocolo}://${subdominio}.${config.rootDomain}`;
}

export function urlMarketplace(): string {
  const protocolo = config.rootDomain.includes('localhost') ? 'http' : 'https';
  return `${protocolo}://${config.rootDomain}`;
}

export function urlArchivo(ruta: string | null): string | null {
  return ruta ? `${config.publicApiUrl}${ruta}` : null;
}
