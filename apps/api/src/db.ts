import type { SqlRunner } from '../../../database/migrate.ts';

export type DbRole = 'cuidope_anon' | 'cuidope_app' | 'cuidope_service';
const ROLES: ReadonlySet<string> = new Set<DbRole>(['cuidope_anon', 'cuidope_app', 'cuidope_service']);
export type Query = <T = Record<string, any>>(sql: string, params?: unknown[]) => Promise<T[]>;

/**
 * Executa cada requisição numa transação com papel e usuário fixados no servidor (SET LOCAL).
 * O cliente nunca escolhe papel nem id. PGlite é conexão única → serializamos; com `pg` cada chamada usa uma conexão do pool.
 */
export class Db {
  private readonly runner: SqlRunner;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(runner: SqlRunner) { this.runner = runner; }

  run<T>(role: DbRole, userId: string | null, fn: (q: Query) => Promise<T>): Promise<T> {
    if (!ROLES.has(role)) throw new Error('papel inválido');
    const job = this.chain.then(async () => {
      await this.runner.exec('begin');
      try {
        await this.runner.exec(`set local role ${role}`);
        await this.runner.query(`select set_config('app.user_id', $1, true)`, [userId ?? '']);
        const q: Query = async (sql, params) => (await this.runner.query(sql, params)).rows as any[];
        const out = await fn(q);
        await this.runner.exec('commit');
        return out;
      } catch (e) {
        await this.runner.exec('rollback').catch(() => {});
        throw e;
      }
    });
    this.chain = job.catch(() => undefined);
    return job;
  }
  anon<T>(fn: (q: Query) => Promise<T>) { return this.run('cuidope_anon', null, fn); }
  service<T>(fn: (q: Query) => Promise<T>) { return this.run('cuidope_service', null, fn); }
}
