import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, type Phase } from '../packages/domain/src/flags.ts';

const labels: Record<Phase, string> = { MVP_A: 'MVP A — descoberta e receita SaaS', MVP_B: 'MVP B — transações dentro da plataforma', V1: 'V1', V2: 'V2' };
const st = { backend_pronto: '✅ backend pronto', parcial: '🟡 parcial', planejado: '⬜ planejado' } as const;
let md = `# Backlog e registro de funcionalidades\n\n> Gerado por \`npm run backlog\` a partir de \`packages/domain/src/flags.ts\`. Não editar à mão.\n> "Dono" é uma função; atribuir nomes ao iniciar cada frente. Status descreve o repositório hoje, não produção.\n\n`;
for (const phase of Object.keys(labels) as Phase[]) {
  md += `## ${labels[phase]}\n\n| Flag | Funcionalidade | Dono | Status | Padrão | Depende de | Custo operacional | Critério de aceite |\n|---|---|---|---|---|---|---|---|\n`;
  for (const f of FEATURES.filter((x) => x.phase === phase)) {
    md += `| \`${f.key}\` | ${f.title} | ${f.owner} | ${st[f.status]} | ${f.defaultOn ? 'ligada' : 'desligada'} | ${f.dependsOn.map((d) => `\`${d}\``).join(', ') || '—'} | ${f.opCost} | ${f.acceptance} |\n`;
  }
  md += '\n';
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'backlog.md');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md);
console.log('Backlog gravado em', out, `(${FEATURES.length} funcionalidades)`);
