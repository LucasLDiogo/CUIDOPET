import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Interface mínima compartilhada por PGlite (dev/teste) e por um driver pg (produção). */
export interface SqlRunner {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, 'migrations');

export interface AppliedMigration { name: string; applied: boolean; checksum: string }

export async function applyMigrations(db: SqlRunner, dir = MIGRATIONS_DIR): Promise<AppliedMigration[]> {
  await db.exec(`create table if not exists public.schema_migrations (
    name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
  const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const out: AppliedMigration[] = [];
  for (const name of files) {
    const sql = readFileSync(join(dir, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const prev = await db.query<{ checksum: string }>('select checksum from public.schema_migrations where name = $1', [name]);
    if (prev.rows[0]) {
      if (prev.rows[0].checksum !== checksum) throw new Error(`Migration ${name} foi alterada após aplicada (checksum diferente). Crie uma nova migration.`);
      out.push({ name, applied: false, checksum });
      continue;
    }
    await db.exec('begin');
    try {
      await db.exec(sql);
      await db.query('insert into public.schema_migrations(name, checksum) values ($1, $2)', [name, checksum]);
      await db.exec('commit');
    } catch (e) {
      await db.exec('rollback');
      throw new Error(`Falha na migration ${name}: ${(e as Error).message}`);
    }
    out.push({ name, applied: true, checksum });
  }
  return out;
}
