import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { applyMigrations } from './migrate.ts';

/** Postgres real (WASM) em memória: migrations idênticas às de produção. */
export async function createDb(dataDir?: string): Promise<PGlite> {
  const db = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { btree_gist } });
  await db.waitReady;
  await applyMigrations(db);
  return db;
}

/** Executa `fn` como o papel da aplicação, com o usuário da sessão fixado (equivale a SET LOCAL do API). */
export async function asUser<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? 'cuidope_app' : 'cuidope_anon'}`);
  await db.query(`select set_config('app.user_id', $1, false)`, [userId ?? '']);
  try { return await fn(); }
  finally { await db.exec(`reset role`); await db.query(`select set_config('app.user_id', '', false)`); }
}
