import type { PGlite } from '@electric-sql/pglite';
import { createDb, asUser } from '../testdb.ts';
import { seedDemo, type DemoIds } from '../seed/demo.ts';

export { asUser };
export async function freshDb(): Promise<{ db: PGlite; ids: DemoIds }> {
  const db = await createDb();
  const ids = await seedDemo(db);
  return { db, ids };
}

/** Executa e devolve a mensagem de erro (ou null se não falhou). Em autocommit, uma falha não envenena a sessão. */
export async function failure(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
}

export const range = (from: string, to: string) => `[${from},${to})`;
