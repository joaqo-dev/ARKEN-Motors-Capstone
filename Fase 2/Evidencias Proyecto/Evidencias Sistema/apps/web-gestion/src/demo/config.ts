// Modo demo: no hay API. Las fotos y documentos de ejemplo son archivos del
// propio build (o data: URLs de lo que se suba durante la demo).
import documentoDemo from './archivos/documento-demo.pdf?url';

export const API_URL = '';

// Las rutas de archivos que en el panel real sirve la API (PDFs, fichas,
// boletas) apuntan a un PDF de ejemplo.
export const urlApi = (ruta: string) =>
  /^(data:|blob:|https?:)/.test(ruta) || ruta.startsWith(import.meta.env.BASE_URL)
    ? ruta
    : documentoDemo;

export const DOMINIO_PUBLICO = 'vitriauto.demo';

export const urlVitrina = (subdominio: string) => `https://${subdominio}.${DOMINIO_PUBLICO}`;

// Páginas del sitio público (Términos de uso, Política de privacidad…).
export const urlSitio = (ruta: string) => {
  const protocolo = DOMINIO_PUBLICO.includes('localhost') ? 'http' : 'https';
  return `${protocolo}://${DOMINIO_PUBLICO}${ruta}`;
};
