import { NextRequest, NextResponse } from 'next/server';
import { politicaSeguridad } from './lib/csp';

// Resolución de subdominio (Módulo 3): <subdominio>.<dominio raíz>/ muestra el
// perfil público de esa automotora. La vitrina queda aislada del marketplace:
// en su subdominio, la ficha de un vehículo se muestra con la navegación de la
// automotora (cabecera x-vitrina) y las rutas del marketplace vuelven a su
// portada. En el dominio raíz, /perfil/<subdominio> lleva al subdominio.
const RESERVADOS = new Set(['www', 'app', 'api']);

function perfilDelHost(req: NextRequest): string | null {
  const raiz = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const host = req.headers.get('host')?.toLowerCase();
  if (!raiz || !host || !host.endsWith(`.${raiz}`)) return null;
  const subdominio = host.slice(0, -(raiz.length + 1));
  if (!/^[a-z0-9-]+$/.test(subdominio) || RESERVADOS.has(subdominio)) return null;
  return subdominio;
}

export function middleware(req: NextRequest) {
  // Nonce nuevo en cada respuesta para la Content-Security-Policy. Next.js lo
  // toma de la cabecera de la petición y se lo pone a sus propios scripts.
  const nonce = btoa(crypto.randomUUID());
  const csp = politicaSeguridad(nonce);
  const cabeceras = new Headers(req.headers);
  cabeceras.set('x-nonce', nonce);
  cabeceras.set('Content-Security-Policy', csp);

  // Solo el middleware decide si la petición es de una vitrina.
  cabeceras.delete('x-vitrina');
  const subdominio = perfilDelHost(req);
  const { pathname } = req.nextUrl;
  const lectura = req.method === 'GET' || req.method === 'HEAD';

  if (lectura && subdominio && (pathname === '/buscar' || pathname.startsWith('/perfil'))) {
    // La búsqueda global no existe en la vitrina: sus filtros se aplican al
    // inventario de la automotora.
    const destino = req.nextUrl.clone();
    destino.pathname = '/';
    if (pathname === '/buscar') destino.hash = 'vehiculos';
    else destino.search = '';
    return NextResponse.redirect(destino);
  }
  const perfil = /^\/perfil\/([a-z0-9-]+)\/?$/.exec(pathname)?.[1];
  if (lectura && !subdominio && perfil && process.env.NEXT_PUBLIC_ROOT_DOMAIN) {
    const protocolo = req.nextUrl.protocol;
    return NextResponse.redirect(
      `${protocolo}//${perfil}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}/${req.nextUrl.search}`,
    );
  }

  if (subdominio) cabeceras.set('x-vitrina', subdominio);
  let res: NextResponse;
  if (subdominio && pathname === '/') {
    const destino = req.nextUrl.clone();
    destino.pathname = `/perfil/${subdominio}`;
    res = NextResponse.rewrite(destino, { request: { headers: cabeceras } });
  } else {
    res = NextResponse.next({ request: { headers: cabeceras } });
  }
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico).*)'],
};
