/**
 * Teste rápido contra a API de desenvolvimento já em execução (dados de DEMONSTRAÇÃO).
 * Uso: node scripts/smoke.ts [http://127.0.0.1:3333]
 * Não escreve nada: só chamadas GET públicas.
 */
const base = (process.argv[2] ?? `http://127.0.0.1:${process.env.PORT ?? 3333}`).replace(/\/$/, '');
const PF = 4314100; // Passo Fundo (dado de demonstração)

let falhas = 0;
async function check(nome: string, path: string, esperado: number, extra?: (corpo: any) => string | null) {
  try {
    const r = await fetch(base + path);
    const txt = await r.text();
    let corpo: any = null;
    try { corpo = JSON.parse(txt); } catch { /* corpo não-JSON */ }
    let problema: string | null = r.status === esperado ? null : `status ${r.status} (esperado ${esperado})`;
    if (!problema && extra) problema = extra(corpo);
    if (problema) { falhas++; console.log(`  [FALHA] ${nome}: ${problema}`); }
    else console.log(`  [ OK  ] ${nome}`);
    return corpo;
  } catch (e) {
    falhas++;
    console.log(`  [FALHA] ${nome}: ${(e as Error).message}`);
    return null;
  }
}

console.log(`Cuidope - teste rapido em ${base}\n`);
await check('saude da API', '/v1/health', 200);
await check('regioes do RS', '/v1/regions?uf=RS', 200, (c) => (c?.cities?.length ? null : 'nenhuma cidade'));
const busca = await check('busca: passeio em Passo Fundo', `/v1/search/providers?uf=RS&city_ibge_id=${PF}&service=passeio`, 200,
  (c) => (Array.isArray(c?.results) && c.results.length >= 1 ? null : 'sem resultados'));
if (busca?.results?.[0]) {
  const p = busca.results[0];
  console.log(`         1o resultado: ${p.public_name} (${p.city}) - motivo: ${p.why_appeared ?? p.ranking?.why ?? 'n/d'}`);
}
await check('busca: UF incompativel com a cidade', `/v1/search/providers?uf=SC&city_ibge_id=${PF}&service=passeio`, 400);
await check('busca: sem cidade (obrigatoria)', '/v1/search/providers?uf=RS&service=passeio', 400);
await check('perfil publico: carla-demo', '/v1/providers/carla-demo', 200);
await check('perfil inexistente', '/v1/providers/nao-existe', 404);

console.log(falhas === 0 ? '\nTUDO CERTO.' : `\n${falhas} verificacao(oes) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
