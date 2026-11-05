/**
 * Teste ponta a ponta da demonstração (Playwright). Uso:
 *   npm run build && npx vite preview --port 4173 &  ;  BASE=http://localhost:4173 node e2e/smoke.mjs
 * Percorre a jornada do tutor (busca → perfil → agendamento → confirmação no WhatsApp → avaliação)
 * e a do prestador (painel → aceitar pedido → CRM WhatsApp → agenda → serviços/pacotes), em desktop e celular.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = process.env.OUT ?? 'e2e/screens';
mkdirSync(OUT, { recursive: true });
const results = [];
const errors = [];
const ok = (name) => { results.push(['PASSOU', name]); console.log('✓', name); };
const fail = (name, e) => { results.push(['FALHOU', name, String(e?.message ?? e).split('\n')[0]]); console.log('✗', name, '—', String(e?.message ?? e).split('\n')[0]); };
async function step(name, fn) { try { await fn(); ok(name); } catch (e) { fail(name, e); } }

const browser = await chromium.launch();
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { ctx, page };
}
const go = (page, hash) => page.goto(`${BASE}/#${hash}`);
const noHScroll = async (page, label) => {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (w[0] > w[1] + 1) throw new Error(`${label}: rolagem horizontal (${w[0]} > ${w[1]})`);
};

/* ---------------- desktop ---------------- */
const { page } = await newPage({ viewport: { width: 1366, height: 860 } });

await step('Início carrega com busca, categorias e destaques', async () => {
  await go(page, '/');
  await page.getByRole('heading', { name: /Quem cuida do seu pet/ }).waitFor();
  await page.getByRole('heading', { name: 'Perto de você' }).waitFor();
  if ((await page.locator('article').count()) < 4) throw new Error('poucos cards de prestador');
  await page.screenshot({ path: `${OUT}/01-inicio.png` });
});

await step('Busca: filtra por categoria e cidade e mostra motivo do ranking', async () => {
  await page.getByRole('button', { name: 'Buscar' }).first().click();
  await page.waitForURL(/buscar/);
  await go(page, '/buscar?cat=banho_tosa&cidade=passo-fundo-rs');
  await page.getByText(/resultado/).first().waitFor();
  const n = await page.locator('article').count();
  if (n < 2) throw new Error(`esperava ≥2 resultados de banho e tosa em Passo Fundo, veio ${n}`);
  await page.getByText('Por que aparece:').first().waitFor();
  await page.getByRole('tab', { name: /Mapa/ }).click();
  await page.getByText('Localização aproximada do bairro').waitFor();
  await page.screenshot({ path: `${OUT}/02-busca-mapa.png` });
});

await step('Busca vazia explica o filtro', async () => {
  await go(page, '/buscar?cat=vet_domicilio&cidade=caxias-do-sul-rs');
  await page.getByText('Nenhum prestador com esses filtros').waitFor();
});

await step('Perfil do prestador: serviços, pacotes e avaliações', async () => {
  await go(page, '/p/casa-da-carla-pet-house');
  await page.getByRole('heading', { name: 'Casa da Carla Pet House' }).waitFor();
  await page.getByRole('tab', { name: /Pacotes/ }).click();
  await page.getByText('10 passeios de 60 min').waitFor();
  await page.getByRole('tab', { name: /Avaliações/ }).click();
  await page.getByText(/avaliações verificadas/).waitFor();
  await page.getByRole('button', { name: '3 ou menos' }).click();
  await page.screenshot({ path: `${OUT}/03-perfil-avaliacoes.png` });
});

await step('Tutor: agenda um passeio (login demo dentro do fluxo)', async () => {
  await go(page, '/p/casa-da-carla-pet-house');
  await page.getByRole('tab', { name: /Serviços/ }).click();
  await page.locator('li', { hasText: 'Passeio 60 min' }).getByRole('link', { name: 'Agendar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar como Ana (demo)' }).click();
  await page.getByText('Para qual pet?').waitFor();
  await page.locator('label', { hasText: 'Thor' }).locator('input').check();
  const mia = page.locator('label', { hasText: 'Mia' }).locator('input');
  if (!(await mia.isDisabled())) throw new Error('gata Mia deveria estar bloqueada para passeio de cães');
  await page.getByRole('button', { name: 'Continuar' }).click();
  // escolhe um dia útil com horário livre
  const dayBtns = page.locator('button:has(span.font-display)');
  let picked = false;
  for (let i = 2; i < 10 && !picked; i++) {
    const b = dayBtns.nth(i); if (await b.isDisabled()) continue;
    await b.click(); await page.waitForTimeout(250);
    const free = page.locator('div.grid button:not([disabled])').filter({ hasText: /^\d{2}:\d{2}$/ });
    if (await free.count()) { await free.nth(Math.min(2, (await free.count()) - 1)).click(); picked = true; }
  }
  if (!picked) throw new Error('nenhum horário livre encontrado');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('WhatsApp (com DDD)').fill('(54) 99123-4567');
  await page.screenshot({ path: `${OUT}/04-agendar-confirmar.png` });
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await page.getByRole('heading', { name: 'Pedido enviado!' }).waitFor();
  await page.screenshot({ path: `${OUT}/05-pedido-enviado.png` });
});

let code = '';
await step('Tutor: pedido aparece como "Aguardando prestador"', async () => {
  await page.getByRole('button', { name: 'Acompanhar pedido' }).click();
  await page.getByText('Aguardando prestador').first().waitFor();
  code = (await page.getByText(/Protocolo CP-\d+/).first().textContent()).match(/CP-\d+/)[0];
});

await step('Prestador: painel mostra KPIs, gráfico e pedidos', async () => {
  await page.getByRole('button', { name: 'Prestador', exact: true }).click();
  await page.waitForURL(/painel/);
  await page.getByText('Aguardando atendimento').first().waitFor();
  await page.getByRole('img', { name: 'Gráfico de receita semanal' }).waitFor();
  await page.screenshot({ path: `${OUT}/06-painel.png` });
});

await step('Prestador: aceita o pedido da Ana pelo CRM e envia confirmação no WhatsApp', async () => {
  await go(page, '/painel/whatsapp');
  await page.locator('ul button', { hasText: 'Ana Paula Ribeiro' }).first().click();
  await page.getByText(new RegExp(code)).first().waitFor();
  const accept = page.getByRole('button', { name: 'Aceitar e pedir confirmação' }).first();
  await accept.click();
  await page.getByText(/Toque em \*?Confirmar/).last().waitFor({ timeout: 4000 }).catch(() => {});
  await page.getByText('esperando o “Confirmar”').first().waitFor();
  await page.getByLabel('Mensagem').fill('Oi Ana! Thor confirmado do nosso lado 🐾');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.locator('.whitespace-pre-wrap', { hasText: 'Thor confirmado do nosso lado' }).waitFor();
  await page.getByRole('button', { name: /Modelos/ }).click();
  await page.getByText('Modelos aprovados do WhatsApp').waitFor();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${OUT}/07-crm-whatsapp.png` });
});

await step('CRM: funil (kanban) e filtros por status', async () => {
  await page.getByRole('tab', { name: /Funil/ }).click();
  await page.getByText('Arraste conversas para cá').first().waitFor({ timeout: 3000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/08-crm-funil.png` });
  await page.getByRole('tab', { name: /Caixa/ }).click();
  await page.getByRole('button', { name: /Aguardando cliente/ }).first().click();
});

await step('Tutor: confirma pelo botão do WhatsApp e vira "Confirmado"', async () => {
  await page.getByRole('button', { name: 'Tutor', exact: true }).click();
  await page.waitForURL(/conta/);
  await page.getByText(/aceitou seu pedido/).first().click();
  await page.getByText('Aguardando sua confirmação').first().waitFor();
  await page.locator('aside').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByText('Confirmado', { exact: true }).first().waitFor();
  await page.getByText(/confirmado ✓/).first().waitFor();
  await page.screenshot({ path: `${OUT}/09-tutor-confirmou.png` });
});

await step('Prestador: conversa vira "Agendado" e agenda semanal renderiza', async () => {
  await page.getByRole('button', { name: 'Prestador', exact: true }).click();
  await page.waitForURL(/#\/painel$/);
  await go(page, '/painel/whatsapp');
  const item = page.locator('ul button', { hasText: 'Ana Paula Ribeiro' }).first();
  await item.waitFor();
  const txt = await item.innerText();
  if (!/Agendado/.test(txt)) throw new Error('conversa da Ana não está Agendado: ' + txt.replace(/\n/g, ' | '));
  await go(page, '/painel/agenda');
  await page.getByText('dia').first().waitFor();
  await page.screenshot({ path: `${OUT}/10-agenda.png` });
});

await step('Prestador: conclui um atendimento de hoje (pede avaliação)', async () => {
  await go(page, '/painel');
  const btn = page.getByRole('button', { name: 'Concluir' }).first();
  if (await btn.count()) await btn.click();
  else { const ci = page.getByRole('button', { name: 'Check-in' }).first(); await ci.click(); await page.getByRole('button', { name: 'Concluir' }).first().click(); }
  await page.getByText(/pedido de avaliação enviado/).first().waitFor();
});

await step('Prestador: cria serviço e pacote com validação', async () => {
  await go(page, '/painel/servicos');
  await page.getByRole('button', { name: 'Novo serviço' }).first().click();
  await page.getByLabel('Nome').fill('Passeio de aventura 90 min');
  await page.getByLabel('Preço (R$)').fill('65,00');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Passeio de aventura 90 min').waitFor();
  await go(page, '/painel/pacotes');
  await page.getByRole('button', { name: 'Novo pacote' }).click();
  await page.getByLabel('Nome do pacote').fill('Teste 5 passeios');
  await page.getByLabel('Sessões').fill('5');
  await page.getByLabel('Preço do pacote (R$)').fill('99999');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('menor ou igual ao avulso').waitFor();
  await page.getByLabel('Preço do pacote (R$)').fill('150');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Teste 5 passeios').waitFor();
});

await step('Prestador: clientes, avaliações (responder) e automação', async () => {
  await go(page, '/painel/clientes'); await page.getByText('Ana Paula Ribeiro').first().waitFor();
  await go(page, '/painel/avaliacoes');
  const input = page.getByLabel('Resposta').first();
  if (await input.count()) { await input.fill('Muito obrigada pelo carinho!'); await page.getByRole('button', { name: 'Publicar' }).first().click(); await page.getByText('Resposta publicada').waitFor(); }
  await go(page, '/painel/config'); await page.getByText('Pedir confirmação ao aceitar um pedido').waitFor();
  await go(page, '/painel/perfil'); await page.getByText('Horário de atendimento').waitFor();
});

await step('Isolamento: tutor não acessa o painel do prestador', async () => {
  await page.getByRole('button', { name: 'Tutor', exact: true }).click();
  await page.waitForURL(/#\/conta$/);
  await go(page, '/painel');
  await page.getByText('Esta área é para prestadores').waitFor();
});

await step('Cadastro de novo prestador (onboarding)', async () => {
  await go(page, '/anunciar');
  await page.getByLabel(/Nome do negócio/).fill('Patas Felizes Pet House');
  await page.getByRole('button', { name: 'Pet house' }).click();
  await page.getByLabel('WhatsApp do negócio').fill('(54) 99876-1234');
  await page.getByLabel('E-mail').fill('patas@exemplo.com.br');
  await page.getByText(/Declaro ter 18 anos/).click();
  await page.getByRole('button', { name: 'Criar meu perfil' }).click();
  await page.waitForURL(/painel\/servicos/);
  await page.getByText('Cadastre seu primeiro serviço').waitFor();
});

await step('Tema escuro renderiza', async () => {
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await go(page, '/p/banho-bossa-pet-shop');
  await page.getByRole('heading', { name: 'Banho & Bossa Pet Shop' }).waitFor();
  await page.screenshot({ path: `${OUT}/11-escuro.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
});

/* ---------------- celular ---------------- */
const { page: m } = await newPage({ ...require('playwright').devices['iPhone 13'] });
for (const [label, hash] of [['início', '/'], ['busca', '/buscar?cidade=passo-fundo-rs'], ['perfil', '/p/casa-da-carla-pet-house'], ['agendar', '/agendar/casa-da-carla-pet-house']]) {
  await step(`Celular sem rolagem horizontal: ${label}`, async () => { await go(m, hash); await m.waitForTimeout(500); await noHScroll(m, label); });
}
await step('Celular: painel, agenda e WhatsApp', async () => {
  await go(m, '/entrar'); await m.getByRole('button', { name: /prestadora/ }).click(); await m.waitForURL(/painel/);
  await m.waitForTimeout(400); await noHScroll(m, 'painel'); await m.screenshot({ path: `${OUT}/12-celular-painel.png` });
  await go(m, '/painel/whatsapp'); await m.locator('ul button').first().click(); await m.getByLabel('Mensagem').waitFor(); await noHScroll(m, 'whatsapp');
  await m.screenshot({ path: `${OUT}/13-celular-whatsapp.png` });
  await go(m, '/painel/agenda'); await m.waitForTimeout(300); await noHScroll(m, 'agenda');
});
await step('Celular: área do tutor', async () => {
  await go(m, '/entrar'); await m.getByRole('button', { name: /tutora/ }).click(); await m.waitForURL(/conta/);
  await noHScroll(m, 'conta'); await m.screenshot({ path: `${OUT}/14-celular-tutor.png` });
  await go(m, '/conta/pacotes'); await m.getByText(/sessões restantes/).first().waitFor();
});

await browser.close();
const failed = results.filter((r) => r[0] === 'FALHOU');
console.log(`\n${results.length - failed.length}/${results.length} passaram · erros de console/página: ${errors.length}`);
errors.slice(0, 15).forEach((e) => console.log('  ', e));
process.exit(failed.length || errors.length ? 1 : 0);
