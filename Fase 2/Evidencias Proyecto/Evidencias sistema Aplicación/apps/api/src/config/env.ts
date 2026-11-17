import { z } from 'zod';

// Validación central de variables de entorno: la app no arranca si falta una crítica.
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    JWT_ACCESS_TTL_SEGUNDOS: z.coerce.number().int().positive().default(900),
    REFRESH_TTL_DIAS: z.coerce.number().int().positive().default(7),
    // URL del Panel de Gestión, base de los links enviados por correo.
    APP_URL: z.string().url(),
    // URL pública del marketplace: base del enlace de baja de recordatorios.
    SITIO_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
    // Opcional: p. ej. ".tudominio.cl" para que app.* lea la cookie CSRF emitida por api.*
    COOKIE_DOMAIN: z.string().optional(),
    // Directorio de archivos subidos (volumen persistente en producción).
    UPLOADS_DIR: z.string().default('./uploads'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('Automotoras <onboarding@resend.dev>'),
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.RESEND_API_KEY, {
    message: 'RESEND_API_KEY es obligatoria en producción',
    path: ['RESEND_API_KEY'],
  });

export type AppConfig = z.infer<typeof envSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Variables de entorno inválidas:\n${detalle.join('\n')}`);
  }
  return parsed.data;
}
