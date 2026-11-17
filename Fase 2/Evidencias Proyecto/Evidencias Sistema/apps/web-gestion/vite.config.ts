import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Cabeceras de seguridad del servidor de Vite (desarrollo y `vite preview`).
// En producción las pone Caddy (ver docs/05-seguridad-autenticacion.md).
const cabeceras = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

// Content-Security-Policy del build, como <meta> en index.html: viaja con los
// archivos sin importar quién los sirva. El único script en línea (el del tema)
// se autoriza por su hash; cualquier otro script en línea queda bloqueado.
// En desarrollo no se aplica: Vite inyecta sus propios scripts en línea.
// Sin API (modo demo) solo se permite el propio origen.
function politicaSeguridad(apiUrl: string | null): Plugin {
  const api = apiUrl ? new URL(apiUrl).origin : '';
  return {
    name: 'politica-seguridad',
    apply: 'build',
    transformIndexHtml(html) {
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        ([, codigo]) => `'sha256-${createHash('sha256').update(codigo!).digest('base64')}'`,
      );
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`,
        // Atributos style de React (posiciones de menús flotantes, anchos).
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${api}`.trim(),
        "font-src 'self' data:",
        `connect-src 'self' ${api}`.trim(),
        // Solo la vista previa de un PDF elegido en el equipo (URL blob: local,
        // nunca un sitio externo).
        'frame-src blob:',
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

const alias = {
  // shared-types se compila a CommonJS para la API; aquí se usa su fuente TS.
  '@vitriauto/shared-types': fileURLToPath(
    new URL('../../packages/shared-types/src/index.ts', import.meta.url),
  ),
};

// Modo demo (`vite build --mode demo`): el mismo panel, sin backend. Cambia el
// cliente HTTP y la configuración por un adaptador en memoria (src/demo), usa
// rutas con hash y entra directo como un usuario de ejemplo. El resto del
// código no sabe que está en una demo.
const raiz = fileURLToPath(new URL('.', import.meta.url));
const SUSTITUTOS_DEMO: Record<string, string> = {
  'src/main.tsx': 'src/demo/main.tsx',
  'src/lib/api.ts': 'src/demo/api.ts',
  'src/lib/config.ts': 'src/demo/config.ts',
  'src/features/auth/login.tsx': 'src/demo/login.tsx',
};

function modoDemo(): Plugin {
  return {
    name: 'modo-demo',
    enforce: 'pre',
    async resolveId(fuente, importador, opciones) {
      // src/demo usa los módulos reales (ApiError, qs, react-router-dom).
      if (!importador || importador.startsWith(`${raiz}src/demo/`)) return null;
      if (fuente === 'react-router-dom') return `${raiz}src/demo/router.ts`;
      const real = await this.resolve(fuente, importador, { ...opciones, skipSelf: true });
      const relativo = real?.id.startsWith(raiz) ? real.id.slice(raiz.length) : null;
      const sustituto = relativo ? SUSTITUTOS_DEMO[relativo] : undefined;
      return sustituto ? `${raiz}${sustituto}` : null;
    },
    transformIndexHtml: (html) =>
      html.replace(
        '<title>Panel de gestión</title>',
        '<title>Vitriauto · Demo del panel de gestión</title>',
      ),
    // Las fotos son CC BY / CC BY-SA: la atribución viaja con la demo.
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'CREDITOS-FOTOS.md',
        source: readFileSync(`${raiz}src/demo/fotos/CREDITOS.md`, 'utf8'),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'demo') {
    return {
      // Se sirve como archivos estáticos bajo /demos/vitriauto/ (sin reescrituras).
      base: '/demos/vitriauto/',
      // Sin archivos .env: la demo no lee ninguna variable del entorno.
      envDir: fileURLToPath(new URL('./src/demo', import.meta.url)),
      plugins: [modoDemo(), react(), tailwindcss(), politicaSeguridad(null)],
      resolve: { alias },
      build: {
        outDir: 'dist-demo/demos/vitriauto',
        emptyOutDir: true,
        // El PDF de ejemplo se abre en otra pestaña: como data: URL el navegador lo bloquearía.
        assetsInlineLimit: (archivo: string) => (archivo.endsWith('.pdf') ? false : undefined),
      },
      server: { port: 3002, headers: cabeceras },
      preview: { port: 3002, headers: cabeceras },
    };
  }
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      tailwindcss(),
      politicaSeguridad(env.VITE_API_URL ?? 'http://localhost:4000'),
    ],
    resolve: { alias },
    server: { port: 3001, headers: cabeceras },
    preview: { port: 3001, headers: cabeceras },
  };
});
