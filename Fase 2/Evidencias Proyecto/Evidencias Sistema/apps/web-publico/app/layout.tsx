import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { urlMarketplace } from '../lib/config';
import './globals.css';
import './marketplace.css';
import './vitrina.css';

// Todo el sitio se renderiza por request: Next.js solo agrega el nonce de la
// CSP (middleware.ts) a sus scripts en páginas dinámicas; una página estática
// saldría sin nonce y el navegador bloquearía sus scripts.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Base de las URLs relativas de la metadata (imágenes de vista previa, canónicas).
  metadataBase: new URL(urlMarketplace()),
  title: { default: 'Autos usados en Chile', template: '%s · Vitriauto' },
  description: 'Encuentra autos usados publicados por automotoras de todo Chile.',
  openGraph: { type: 'website', locale: 'es_CL', siteName: 'Vitriauto' },
};

// El sitio público solo usa el tema claro.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
