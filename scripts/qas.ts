/**
 * Sobe o servidor em MODO QAS (homologação): persona de teste, interface em /qas, PSP sandbox, dados de DEMONSTRAÇÃO.
 * Multiplataforma (não depende de sintaxe de variável de ambiente do shell).
 * Uso: npm run qas        (porta padrão 3333; mude com PORT=...)
 * Recusa produção: o servidor e o buildApp também recusam.
 */
if (process.env.CUIDOPE_ENV === 'production') {
  console.error('Modo QAS é proibido em produção.');
  process.exit(1);
}
process.env.CUIDOPE_ENV = 'qas';
await import('../apps/api/src/server.ts');
