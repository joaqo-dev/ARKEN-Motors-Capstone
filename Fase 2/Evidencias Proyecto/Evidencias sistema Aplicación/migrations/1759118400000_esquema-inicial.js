// Migración base: crea el esquema completo.
//
// Mientras el proyecto no esté en producción aplica docs/schema.sql tal cual:
// el esquema se cambia editando ese archivo y la base local se recrea con
// `pnpm db:reset`, sin migraciones nuevas.
//
// En el primer despliegue se congela: se copia docs/schema.sql de ese momento a
// migrations/base/esquema-inicial.sql (docs/07-despliegue.md, secciones 4 y 7) y desde
// entonces esta migración lee siempre esa copia. Así una base nueva (otro
// servidor, una restauración sobre una base vacía, la base local) recibe el
// esquema inicial y después las migraciones incrementales, sin chocar con los
// cambios que docs/schema.sql ya describe. node-pg-migrate no lee
// subcarpetas, así que la copia no se ejecuta como una migración más.
const fs = require('node:fs');
const path = require('node:path');

const congelado = path.join(__dirname, 'base', 'esquema-inicial.sql');
const vigente = path.join(__dirname, '..', 'docs', 'schema.sql');

exports.up = (pgm) => {
  pgm.sql(fs.readFileSync(fs.existsSync(congelado) ? congelado : vigente, 'utf8'));
};

exports.down = false; // baseline irreversible
