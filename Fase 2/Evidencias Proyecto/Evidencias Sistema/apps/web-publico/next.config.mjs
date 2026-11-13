import { fileURLToPath } from 'node:url';

const produccion = process.env.NODE_ENV === 'production';

// Cabeceras de seguridad de todas las respuestas. La Content-Security-Policy no
// va aquí: lleva un nonce distinto por respuesta y la arma middleware.ts.
const cabeceras = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  // Solo en producción (siempre detrás de HTTPS); cubre los subdominios de las vitrinas.
  ...(produccion
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build autocontenido para la imagen Docker (deploy/Dockerfile); la raíz del
  // monorepo permite incluir @vitriauto/shared-types.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@vitriauto/shared-types'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: cabeceras }];
  },
};

export default nextConfig;
