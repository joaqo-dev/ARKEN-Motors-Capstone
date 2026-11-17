// Content-Security-Policy del sitio público. Los scripts solo corren si traen
// el nonce de la respuesta (Next.js se lo pone a los suyos): un script
// inyectado por un atacante no lo conoce y el navegador lo bloquea.
export function politicaSeguridad(nonce: string): string {
  const desarrollo = process.env.NODE_ENV !== 'production';
  const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin;
  return [
    "default-src 'self'",
    // En desarrollo Next.js evalúa código para la recarga en caliente.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ''}`,
    // Los atributos style de React (posiciones, fondos del banner) son en línea.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${api}`,
    "font-src 'self' data:",
    `connect-src 'self'${desarrollo ? ' ws: wss:' : ''}`,
    // Mapa de las sucursales (vitrina).
    'frame-src https://maps.google.com https://www.google.com',
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(desarrollo ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
