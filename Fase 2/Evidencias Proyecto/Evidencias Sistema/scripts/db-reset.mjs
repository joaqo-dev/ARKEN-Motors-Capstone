// Recrea la base de desarrollo: borra todo, aplica docs/schema.sql (vía la
// migración base) y carga la demo del seed. Se niega a correr contra una base
// que no sea local.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = process.env.DATABASE_URL ?? env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL en .env');

const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`db:reset solo funciona con una base local (DATABASE_URL apunta a "${host}").`);
  process.exit(1);
}

const { Client } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg');
const cliente = new Client({ connectionString: url });
await cliente.connect();
await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await cliente.end();
console.log('Base vaciada. Aplicando docs/schema.sql…');

// La misma base para la migración y el seed (el API lee su propio .env).
const opciones = { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } };
execSync('pnpm db:migrate', opciones);
execSync('pnpm --filter @vitriauto/api seed', opciones);
console.log('Listo: base recreada con los datos de demo.');
