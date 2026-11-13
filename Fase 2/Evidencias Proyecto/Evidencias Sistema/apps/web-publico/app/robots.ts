import type { MetadataRoute } from 'next';
import { urlMarketplace } from '../lib/config';

// Se sirve en el dominio raíz y en cada subdominio. Todo el sitemap vive en el
// dominio raíz. Vehículos y búsquedas no se bloquean aquí: llevan "noindex"
// para que Google igual siga sus enlaces hacia las vitrinas.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/recordatorios'] },
    sitemap: `${urlMarketplace()}/sitemap.xml`,
  };
}
