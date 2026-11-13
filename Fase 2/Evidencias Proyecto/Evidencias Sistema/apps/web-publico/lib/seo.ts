import { descripcionSeoAutomotora, tituloSeoAutomotora } from '@vitriauto/shared-types';
import type { AutomotoraPublica } from './api';
import { urlArchivo, urlPerfil } from './config';

// SEO de la vitrina: se posiciona la automotora como empresa (nombre,
// ubicación, contacto), no cada vehículo.

const comunas = (a: AutomotoraPublica) => a.sucursales.map((s) => s.comuna);

export const tituloAutomotora = (a: AutomotoraPublica) => tituloSeoAutomotora(a.nombre, comunas(a));

export const descripcionAutomotora = (a: AutomotoraPublica) =>
  descripcionSeoAutomotora(a.nombre, a.descripcion, comunas(a));

const direccion = (s: AutomotoraPublica['sucursales'][number]) => ({
  '@type': 'PostalAddress',
  streetAddress: s.direccion,
  addressLocality: s.comuna,
  addressRegion: s.region.nombre,
  addressCountry: 'CL',
});

// Datos estructurados schema.org: la automotora como AutoDealer, con la casa
// matriz como dirección principal y las demás sucursales como departamentos.
export function jsonLdAutomotora(a: AutomotoraPublica): string {
  const url = `${urlPerfil(a.subdominio)}/`;
  const principal = a.sucursales.find((s) => s.esPrincipal) ?? a.sucursales[0];
  const otras = a.sucursales.filter((s) => s !== principal);
  const logo = urlArchivo(a.logoUrl);
  const banner = urlArchivo(a.bannerUrl);
  const datos = {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    '@id': `${url}#automotora`,
    name: a.nombre,
    url,
    description: descripcionAutomotora(a),
    email: a.email,
    ...(logo ? { logo } : {}),
    ...(banner || logo ? { image: banner ?? logo } : {}),
    ...(principal
      ? {
          telephone: principal.telefono,
          address: direccion(principal),
        }
      : {}),
    ...(otras.length
      ? {
          department: otras.map((s) => ({
            '@type': 'AutoDealer',
            name: `${a.nombre} — ${s.nombre}`,
            telephone: s.telefono,
            address: direccion(s),
          })),
        }
      : {}),
  };
  // Sin "<" literal: el JSON va dentro de un <script>.
  return JSON.stringify(datos).replace(/</g, '\\u003c');
}
