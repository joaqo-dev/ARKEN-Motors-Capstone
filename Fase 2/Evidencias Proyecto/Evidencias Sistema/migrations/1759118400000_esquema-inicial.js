// Migración base: aplica docs/schema.sql tal cual.
// Mientras no haya producción, el esquema se edita en schema.sql y la base
// local se recrea con `pnpm db:reset`.
const fs = require('node:fs');
const path = require('node:path');

exports.up = (pgm) => {
  pgm.sql(fs.readFileSync(path.join(__dirname, '..', 'docs', 'schema.sql'), 'utf8'));
};

exports.down = false; // baseline irreversible
