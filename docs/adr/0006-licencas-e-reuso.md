# ADR-0006 — Dependências, licenças e reuso

**Status:** aceita · **Data:** 2026-10-08 · Versões fixadas no `package-lock.json`.

| Pacote | Versão | Licença | Uso |
|---|---|---|---|
| zod | 4.6.5 | MIT | validação e geração de OpenAPI |
| fastify | 5.12.5 | MIT | API HTTP |
| @electric-sql/pglite | 0.5.8 | Apache-2.0 | Postgres embutido para dev/teste (não é produção) |
| typescript, @types/node | 5.9.x, 22.x | Apache-2.0, MIT | typecheck |

Licenças conferidas no registro npm em 2026-10-08; reconferir ao atualizar (SBOM: `npm sbom --sbom-format cyclonedx`).

**Repositórios de referência da especificação (§26):** nenhum código foi copiado, instalado ou executado. `calcom/cal.diy` (MIT), `chatwoot` (MIT, exceto `enterprise/`) seguem como candidatos a avaliação futura; `dogwalking-pro`, `DoggieWalkers` (sem licença confirmada) e `sharetribe` (licença restritiva) ficam só como estudo.
