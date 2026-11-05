import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../../../database/testdb.ts';
import { seedDemo } from '../../../database/seed/demo.ts';
import { buildApp } from './app.ts';

/**
 * Servidor de DESENVOLVIMENTO: Postgres embutido (PGlite) persistido em ./data/dev-db com dados de demonstração.
 * Produção exigirá o adaptador `pg` (ver docs/adr/0005-banco-e-rls.md e backlog B-001) — por isso é recusada aqui.
 */
if (process.env.CUIDOPE_ENV === 'production') {
  console.error('Produção ainda não suportada: falta o adaptador PostgreSQL gerenciado (backlog B-001). Use staging após o incremento 2.');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const qas = process.env.CUIDOPE_ENV === 'qas';          // homologação: persona de teste + interface /qas (banco separado do dev)
const dataDir = join(root, 'data', qas ? 'qas-db' : 'dev-db');
mkdirSync(dataDir, { recursive: true });
const db = await createDb(dataDir);
const has = (await db.query<{ n: number }>(`select count(*)::int as n from public.regions`)).rows[0]!.n;
if (!has) { await seedDemo(db); console.log('Dados de DEMONSTRAÇÃO criados (fictícios).'); }

const secret = process.env.SANDBOX_WEBHOOK_SECRET ?? 'dev-only-secret-change-me-0000';
const app = await buildApp({ runner: db, webhookSecret: secret, logger: true, qas });
const port = Number(process.env.PORT ?? 3333);
await app.listen({ port, host: '127.0.0.1' });
console.log(qas
  ? `Cuidopê QAS (dados de DEMONSTRAÇÃO, PSP sandbox) em http://127.0.0.1:${port}/qas`
  : `Cuidopê API (dev) em http://127.0.0.1:${port}/v1/health`);
