import type { MetadataRoute } from 'next';
import { urlMarketplace } from '../lib/config';

// Se sirve en el dominio raíz y en cada subdominio. Todo el sitemap vive en el
// dominio raíz (una propiedad de dominio en Search Console cubre los subdominios).
// El detalle de vehículos y las búsquedas no se bloquean aquí: llevan
// "noindex" para que Google igual siga sus enlaces hacia las vitrinas.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/recordatorios'] },
    sitemap: `${urlMarketplace()}/sitemap.xml`,
  };
}
