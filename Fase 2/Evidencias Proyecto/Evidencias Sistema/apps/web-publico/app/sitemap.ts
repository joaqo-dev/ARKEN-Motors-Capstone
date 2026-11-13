import type { MetadataRoute } from 'next';
import { api } from '../lib/api';
import { urlMarketplace, urlPerfil } from '../lib/config';

// Lo que se indexa: la portada del marketplace y la vitrina de cada
// automotora. Ni vehículos ni búsquedas: el SEO se enfoca en las empresas.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vitrinas = (await api.vitrinas().catch(() => null)) ?? [];
  return [
    { url: `${urlMarketplace()}/`, changeFrequency: 'daily', priority: 0.6 },
    ...vitrinas.map((v) => ({
      url: `${urlPerfil(v.subdominio)}/`,
      changeFrequency: 'weekly' as const,
      priority: 1,
    })),
  ];
}
