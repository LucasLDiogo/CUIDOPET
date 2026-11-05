#!/usr/bin/env node
/**
 * Roda stubs + migration + seed + testes de RLS no PGlite (Postgres WASM, em memória).
 * O PGlite NÃO é dependência do app: instale numa pasta à parte e aponte PGLITE_DIR para ela.
 *
 *   mkdir -p /tmp/pglite && (cd /tmp/pglite && npm i @electric-sql/pglite@0.3.15)
 *   PGLITE_DIR=/tmp/pglite node supabase/tests/run-pglite.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dir = process.env.PGLITE_DIR;
if (!dir) { console.error('defina PGLITE_DIR (pasta onde @electric-sql/pglite foi instalado)'); process.exit(2); }
const mod = (p) => pathToFileURL(resolve(dir, 'node_modules/@electric-sql/pglite/dist', p)).href;

const { PGlite } = await import(mod('index.js'));
const { pg_trgm } = await import(mod('contrib/pg_trgm.js'));
const { pgcrypto } = await import(mod('contrib/pgcrypto.js'));

const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto } });
const files = [
  'tests/00_stubs_supabase.sql',
  'migrations/20261104000100_cuidope_marketplace.sql',
  'seed.sql',
  'tests/10_rls_e_regras.sql',
];
for (const f of files) {
  const sql = readFileSync(resolve(root, f), 'utf8');
  const t0 = Date.now();
  try {
    const res = await db.exec(sql);
    const last = res.at(-1);
    console.log(`✔ ${f} (${Date.now() - t0} ms)`);
    if (f.endsWith('10_rls_e_regras.sql')) {
      const resumo = res.filter((r) => r.fields?.[0]?.name === 'resultado').at(-1);
      console.log('  ', resumo?.rows?.[0]?.resultado ?? JSON.stringify(last?.rows?.slice(-1)));
    }
  } catch (err) {
    console.error(`✘ ${f}: ${err.message}`);
    process.exitCode = 1;
    break;
  }
}
await db.close();
