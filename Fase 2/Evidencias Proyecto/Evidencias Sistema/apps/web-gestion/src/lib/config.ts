const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
if (!apiUrl) throw new Error('Falta la variable de entorno VITE_API_URL');

export const API_URL = apiUrl.replace(/\/$/, '');

// URL absoluta de un archivo servido por la API (fotos públicas, PDFs y documentos privados).
export const urlApi = (ruta: string) => `${API_URL}${ruta}`;

// Dominio raíz del sitio público: cada automotora vive en <subdominio>.<dominio>.
export const DOMINIO_PUBLICO = (
  (import.meta.env.VITE_DOMINIO_PUBLICO as string | undefined) || 'tudominio.cl'
).replace(/\/$/, '');

export const urlVitrina = (subdominio: string) => {
  const protocolo = DOMINIO_PUBLICO.includes('localhost') ? 'http' : 'https';
  return `${protocolo}://${subdominio}.${DOMINIO_PUBLICO}`;
};

// Páginas del sitio público (Términos de uso, Política de privacidad…).
export const urlSitio = (ruta: string) => {
  const protocolo = DOMINIO_PUBLICO.includes('localhost') ? 'http' : 'https';
  return `${protocolo}://${DOMINIO_PUBLICO}${ruta}`;
};
