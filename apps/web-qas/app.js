'use strict';
/* Cuidopê — interface de HOMOLOGAÇÃO (QAS). Dados fictícios, PSP sandbox. Sem innerHTML: todo texto entra via textContent. */
(() => {
  const PERSONAS = [
    ['ana', 'Ana — tutora'], ['bruno', 'Bruno — tutor'], ['carla', 'Carla — tutora e prestadora'],
    ['diego', 'Diego — prestador'], ['elisa', 'Elisa — prestadora'],
  ];
  const CATEGORIES = [
    ['passeio', 'Passeio'], ['hospedagem_domiciliar', 'Hospedagem domiciliar'], ['creche_diurna', 'Creche diurna'], ['visita_domicilio', 'Visita em domicílio'],
    ['baba_pernoite', 'Babá com pernoite'], ['banho', 'Banho'], ['tosa', 'Tosa'], ['banho_tosa', 'Banho e tosa'],
  ];
  const CAT_NAME = Object.fromEntries(CATEGORIES);
  const UNIT = { night: 'noite', day: 'dia', hour: 'hora', walk: 'passeio', visit: 'visita', service: 'serviço' };
  const SPECIES = { dog: 'Cão', cat: 'Gato' };
  const SIZE = { small: 'pequeno', medium: 'médio', large: 'grande' };
  const REQ_STATUS = { open: ['Novo', 'info'], discussing: ['Em conversa', 'info'], quoted: ['Com proposta', 'warn'], accepted: ['Aceito', 'ok'], declined: ['Recusado', 'bad'], expired: ['Expirado', 'bad'], cancelled: ['Cancelado', 'bad'] };
  const BK_STATUS = { awaiting_payment: ['Aguardando pagamento', 'warn'], confirmed: ['Confirmada', 'ok'], ready: ['Pronta', 'ok'], in_progress: ['Em andamento', 'info'], completed: ['Concluída', 'ok'], cancelled: ['Cancelada', 'bad'], no_show: ['Não compareceu', 'bad'], interrupted: ['Interrompida', 'warn'] };
  const QUOTE_STATUS = { draft: ['Rascunho', ''], sent: ['Enviada', 'info'], accepted: ['Aceita', 'ok'], revised: ['Substituída', ''], expired: ['Expirada', 'bad'], rejected: ['Recusada', 'bad'] };

  const $ = (s, r = document) => r.querySelector(s);
  const state = { persona: null, me: null, mode: 'tutor', tab: null, timers: [] };

  // ── utilidades ──────────────────────────────────────────────────────────────
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dt = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const stars = (n) => { const r = Math.round(n); return h('span', { class: 'stars', role: 'img', 'aria-label': `${n.toFixed(1).replace('.', ',')} de 5` }, '★'.repeat(r) + '☆'.repeat(5 - r)); };
  const badge = (map, key) => { const [t, c] = map[key] || [key, '']; return h('span', { class: `badge ${c}` }, t); };
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* sem storage: segue em memória */ } },
  };
  const parseMoney = (s) => {
    let t = String(s).replace(/[R$\s]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN;
  };
  const toIsoFromLocal = (v) => new Date(v).toISOString();
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const petsText = (pets) => (pets || []).map((p) => (typeof p === 'string' ? p : [p.name, [SPECIES[p.species], SIZE[p.size]].filter(Boolean).join(', ')].filter(Boolean).join(' — '))).join('; ');

  let toastTimer = null;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (isError ? ' error' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 7000 : 4000);
  }
  function logCall(method, path, status, corr, ms) {
    const li = h('li', {}, `${new Date().toLocaleTimeString('pt-BR')} ${method} ${path} → ${status} (${ms} ms) ${corr ? 'corr=' + corr : ''}`);
    const ol = $('#loglist'); ol.prepend(li); while (ol.children.length > 40) ol.lastChild.remove();
  }

  class ApiError extends Error { constructor(msg, problem, status) { super(msg); this.problem = problem; this.status = status; } }
  async function api(method, path, body, headers) {
    const t0 = performance.now();
    let res;
    try {
      res = await fetch('/v1' + path, {
        method, headers: { 'content-type': 'application/json', 'x-qas-persona': state.persona || '', ...(headers || {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      });
    } catch { throw new ApiError('Não consegui falar com o servidor. Ele está rodando?', null, 0); }
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { /* corpo vazio */ }
    logCall(method, path, res.status, res.headers.get('x-correlation-id'), Math.round(performance.now() - t0));
    if (!res.ok) {
      const extra = data && data.detail ? ` (${data.detail})` : '';
      throw new ApiError((data && data.title ? data.title : `Erro ${res.status}`) + extra, data, res.status);
    }
    return data;
  }
  /** Executa uma ação de botão: desabilita durante a chamada e mostra erro em português. */
  async function act(btn, fn) {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message || 'Erro inesperado', true); } finally { if (btn && btn.isConnected) btn.disabled = false; }
  }
  const btn = (label, onClick, cls = '') => { const b = h('button', { type: 'button', class: `btn ${cls}` }, label); b.addEventListener('click', () => act(b, () => onClick(b))); return b; };
  const field = (text, input) => h('label', {}, text, input);
  const sel = (name, options, value) => { const s = h('select', { name }); for (const [v, t] of options) s.append(h('option', { value: v }, t)); if (value != null) s.value = value; return s; };

  // ── navegação ───────────────────────────────────────────────────────────────
  const TABS = {
    tutor: [['buscar', 'Buscar serviços', viewBuscar], ['pedidos', 'Meus pedidos', () => viewPedidos('tutor')], ['reservas', 'Minhas reservas', () => viewReservas('tutor')], ['pets', 'Meus pets', viewPets]],
    provider: [['painel', 'Painel', viewPainel], ['recebidos', 'Pedidos recebidos', () => viewPedidos('provider')], ['agenda', 'Reservas', () => viewReservas('provider')], ['avaliacoes', 'Avaliações', viewAvaliacoes]],
  };
  function clearTimers() { state.timers.forEach(clearInterval); state.timers = []; }
  function setView(...nodes) { clearTimers(); const v = $('#view'); v.replaceChildren(...nodes.flat().filter(Boolean)); }
  function renderTabs() {
    const nav = $('#tabs'); nav.replaceChildren();
    for (const [id, label] of TABS[state.mode]) {
      const b = h('button', { type: 'button', 'aria-current': state.tab === id ? 'page' : null }, label);
      b.addEventListener('click', () => go(id)); nav.append(b);
    }
  }
  function renderModebar() {
    const bar = $('#modebar'); const both = state.me.roles.includes('tutor') && state.me.roles.includes('provider');
    bar.hidden = !both; bar.replaceChildren();
    if (!both) return;
    bar.append(h('span', { class: 'muted' }, 'Esta persona tem dois papéis:'));
    for (const [m, t] of [['tutor', 'Agir como tutor'], ['provider', 'Agir como prestador']]) {
      bar.append(h('button', { type: 'button', class: `btn ${state.mode === m ? '' : 'secondary'}`, onclick: () => { state.mode = m; state.tab = null; go(TABS[m][0][0]); renderModebar(); } }, t));
    }
  }
  async function go(tab) {
    state.tab = tab; renderTabs();
    const entry = TABS[state.mode].find((t) => t[0] === tab);
    setView(h('p', { class: 'muted' }, 'Carregando…'));
    try { await entry[2](); } catch (e) { setView(h('div', { class: 'card' }, h('h2', {}, 'Não foi possível carregar'), h('p', {}, e.message))); }
  }
  async function loadPersona(key) {
    state.persona = key; store.set('qas-persona', key);
    state.me = await api('GET', '/me');
    state.mode = state.me.roles.includes('provider') && !state.me.roles.includes('tutor') ? 'provider' : 'tutor';
    renderModebar(); await go(TABS[state.mode][0][0]);
  }

  // ── TUTOR: buscar ───────────────────────────────────────────────────────────
  async function viewBuscar() {
    const regions = await api('GET', '/regions?uf=RS');
    const city = sel('city', regions.cities.map((c) => [c.city_ibge_id, c.name])); const service = sel('service', CATEGORIES);
    const species = sel('species', [['all', 'Cães e gatos'], ['dog', 'Cão'], ['cat', 'Gato']]);
    const size = sel('size', [['', 'Qualquer porte'], ['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande']]);
    const out = h('div');
    const run = async () => {
      out.replaceChildren(h('p', { class: 'muted' }, 'Buscando…'));
      const q = new URLSearchParams({ uf: 'RS', city_ibge_id: city.value, service: service.value, species: species.value });
      if (size.value) q.set('size', size.value);
      try { renderResults(out, await api('GET', '/search/providers?' + q)); } catch (e) { out.replaceChildren(h('div', { class: 'empty' }, e.message)); }
    };
    const form = h('form', { class: 'card', onsubmit: (ev) => { ev.preventDefault(); run(); } },
      h('div', { class: 'grid' }, field('Cidade', city), field('Serviço', service), field('Espécie', species), field('Porte', size)),
      h('p', {}, h('button', { class: 'btn', type: 'submit' }, 'Buscar')));
    setView(h('h2', {}, 'Buscar serviços'), form, out);
    run();
  }
  function renderResults(out, res) {
    out.replaceChildren();
    const all = [...res.sponsored, ...res.results];
    if (!all.length) {
      out.append(h('div', { class: 'empty' }, res.empty ? res.empty.message : 'Nenhum resultado.',
        (res.empty && res.empty.suggestions || []).map((s) => h('div', { class: 'muted' }, `Dica: flexibilizar ${({ dates: 'as datas', species: 'a espécie', size: 'o porte', neighborhood: 'o bairro' })[s.relax]} traria ${s.would_return} resultado(s).`))));
      return;
    }
    for (const p of all) {
      out.append(h('article', { class: 'card' },
        h('div', { class: 'row between' }, h('h3', {}, p.public_name), h('span', {}, p.sponsored ? badge({ s: ['Patrocinado', 'warn'] }, 's') : null, ' ', p.is_demo ? badge({ d: ['Perfil de demonstração', 'warn'] }, 'd') : null)),
        h('p', { class: 'muted' }, [p.neighborhood, p.city].filter(Boolean).join(' · ') + ' — ', p.rating_avg == null ? 'Ainda sem avaliações' : h('span', {}, stars(p.rating_avg), ` ${p.rating_avg.toFixed(1).replace('.', ',')} (${p.rating_count})`)),
        p.bio_short ? h('p', {}, p.bio_short) : null,
        h('div', { class: 'chips' },
          p.badges.identity_verified ? h('span', { class: 'chip' }, `Identidade verificada: ${p.badges.identity_scope || 'documento conferido'}`) : h('span', { class: 'chip' }, 'Identidade não verificada'),
          p.badges.professional ? h('span', { class: 'chip' }, 'Plano Profissional') : null),
        h('div', { class: 'chips' }, p.services.map((s) => h('span', { class: 'chip' }, `${s.title} · ${s.price_is_from ? 'a partir de ' : ''}${brl(s.price_cents)}/${UNIT[s.price_unit] || s.price_unit}`))),
        h('p', { class: 'muted' }, 'Por que apareceu: ' + p.ranking.why),
        btn('Ver perfil', () => viewProfile(p.slug, state.mode === 'tutor', () => go('buscar')), 'secondary')));
    }
  }

  // ── perfil público + solicitação ────────────────────────────────────────────
  async function viewProfile(slug, canRequest, back) {
    const d = await api('GET', '/providers/' + encodeURIComponent(slug));
    const p = d.provider;
    const parts = [
      btn('← Voltar', back, 'secondary'),
      h('h2', {}, p.public_name, ' ', p.is_demo ? badge({ d: ['Demonstração', 'warn'] }, 'd') : null),
      h('p', { class: 'muted' }, [p.neighborhood, p.city, p.uf].filter(Boolean).join(' · ')),
      p.bio ? h('p', {}, p.bio) : null,
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, p.badges.identity_verified ? `Identidade verificada: ${p.badges.identity_scope || ''}` : 'Identidade não verificada'),
        h('span', { class: 'chip' }, p.rating_avg == null ? 'Ainda sem avaliações' : `★ ${p.rating_avg.toFixed(1).replace('.', ',')} (${p.rating_count} avaliações)`)),
      h('h3', {}, 'Serviços'),
    ];
    const reqHost = h('div');
    for (const s of p.services) {
      const card = h('div', { class: 'card' }, h('div', { class: 'row between' },
        h('div', {}, h('strong', {}, s.title), h('div', { class: 'muted' }, `${CAT_NAME[s.category] || s.category} · ${s.price_is_from ? 'a partir de ' : ''}${brl(s.price_cents)}/${UNIT[s.price_unit] || s.price_unit} · ${s.species.map((x) => SPECIES[x]).join(' e ')}`)),
        canRequest ? btn('Solicitar este serviço', async () => { await openRequestForm(reqHost, s, p.public_name); reqHost.scrollIntoView({ behavior: 'smooth' }); }) : null));
      parts.push(card);
    }
    parts.push(reqHost, h('h3', {}, 'Avaliações'));
    if (!d.reviews.items.length) parts.push(h('div', { class: 'empty' }, 'Nenhuma avaliação ainda.'));
    for (const r of d.reviews.items) {
      const avg = (r.scores.communication + r.scores.punctuality + r.scores.care + r.scores.match) / 4;
      parts.push(h('div', { class: 'card' }, stars(avg), ' ', h('span', { class: 'badge' }, r.label === 'reserva_paga' ? 'Reserva paga na plataforma' : 'Confirmada externamente'),
        r.comment ? h('p', {}, r.comment) : null, r.provider_reply ? h('p', { class: 'muted' }, 'Resposta do prestador: ' + r.provider_reply) : null));
    }
    setView(parts);
  }
  async function openRequestForm(host, service, providerName) {
    const pets = (await api('GET', '/me/pets')).items;
    const start = new Date(); start.setDate(start.getDate() + 7); start.setHours(15, 0, 0, 0);
    const end = new Date(start);
    if (service.price_unit === 'night') { end.setDate(end.getDate() + 2); end.setHours(11, 0, 0, 0); } else if (service.price_unit === 'day') end.setHours(start.getHours() + 8); else end.setHours(start.getHours() + 1);
    const from = h('input', { type: 'datetime-local', name: 'from', required: true, value: toLocalInput(start) });
    const to = h('input', { type: 'datetime-local', name: 'to', required: true, value: toLocalInput(end) });
    const msg = h('textarea', { name: 'message', maxlength: '1000', placeholder: 'Conte sobre a rotina, cuidados e horários.' });
    const avail = h('div', { class: 'muted', 'aria-live': 'polite' });
    const petBox = h('div');
    const checks = [];
    const selectedIds = () => checks.filter((c) => c.input.checked).map((c) => c.pet.id);
    const checkAvail = async () => {
      const ids = selectedIds();
      if (!from.value || !to.value || new Date(to.value) <= new Date(from.value)) { avail.textContent = 'Informe um período válido (o fim deve ser depois do início).'; return; }
      try {
        const r = await api('GET', `/listings/${service.listing_id}/availability?from=${encodeURIComponent(toIsoFromLocal(from.value))}&to=${encodeURIComponent(toIsoFromLocal(to.value))}&pets=${Math.max(1, ids.length)}`);
        avail.replaceChildren(badge({ x: r.available ? ['Há vaga neste período', 'ok'] : ['Sem vaga neste período', 'bad'] }, 'x'));
      } catch (e) { avail.textContent = e.message; }
    };
    const drawPets = (list) => {
      checks.length = 0; petBox.replaceChildren();
      if (!list.length) petBox.append(h('p', { class: 'muted' }, 'Você ainda não tem pets. Cadastre um abaixo.'));
      for (const pet of list) {
        const accepted = service.species.includes(pet.species_code);
        const input = h('input', { type: 'checkbox', disabled: !accepted, onchange: checkAvail });
        checks.push({ pet, input });
        petBox.append(h('label', { class: 'row' }, input, `${pet.name} — ${SPECIES[pet.species_code]}, ${SIZE[pet.size]}`, accepted ? '' : ' (espécie não atendida por este serviço)'));
      }
    };
    drawPets(pets);
    const newName = h('input', { name: 'pname', maxlength: '40', placeholder: 'Nome do pet' }); const newSp = sel('psp', [['dog', 'Cão'], ['cat', 'Gato']]); const newSz = sel('psz', [['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande']]);
    const addPet = btn('Cadastrar pet', async () => {
      if (!newName.value.trim()) throw new Error('Informe o nome do pet');
      await api('POST', '/me/pets', { name: newName.value.trim(), species_code: newSp.value, size: newSz.value });
      newName.value = ''; drawPets((await api('GET', '/me/pets')).items); toast('Pet cadastrado');
    }, 'secondary');
    from.addEventListener('change', checkAvail); to.addEventListener('change', checkAvail);
    const send = btn('Enviar pedido ao prestador', async () => {
      const ids = selectedIds();
      if (!ids.length) throw new Error('Selecione ao menos um pet');
      if (!from.value || !to.value) throw new Error('Informe o período');
      await api('POST', '/me/requests', { listing_id: service.listing_id, from: toIsoFromLocal(from.value), to: toIsoFromLocal(to.value), pet_ids: ids, message: msg.value });
      toast('Pedido enviado. O prestador vai responder com uma proposta.'); go('pedidos');
    });
    host.replaceChildren(h('form', { class: 'card', onsubmit: (e) => e.preventDefault() },
      h('h3', {}, `Solicitar: ${service.title} (${providerName})`),
      h('div', { class: 'grid' }, field('Início', from), field('Fim', to)), avail,
      h('h3', {}, 'Quais pets?'), petBox,
      h('details', {}, h('summary', {}, 'Cadastrar outro pet'), h('div', { class: 'grid' }, field('Nome', newName), field('Espécie', newSp), field('Porte', newSz)), addPet),
      field('Mensagem', msg), h('p', {}, send), h('p', { class: 'muted' }, 'Nada é cobrado agora: o pagamento só acontece depois que você aceitar uma proposta.')));
    checkAvail();
  }

  // ── pets ────────────────────────────────────────────────────────────────────
  async function viewPets() {
    const draw = async () => {
      const list = (await api('GET', '/me/pets')).items;
      host.replaceChildren(...(list.length ? list.map((p) => h('div', { class: 'card' }, h('strong', {}, p.name), ` — ${SPECIES[p.species_code]}, porte ${SIZE[p.size]}`)) : [h('div', { class: 'empty' }, 'Nenhum pet cadastrado.')]));
    };
    const host = h('div');
    const name = h('input', { name: 'name', maxlength: '40', required: true }); const sp = sel('sp', [['dog', 'Cão'], ['cat', 'Gato']]); const sz = sel('sz', [['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande']]);
    const add = btn('Cadastrar pet', async () => { if (!name.value.trim()) throw new Error('Informe o nome do pet'); await api('POST', '/me/pets', { name: name.value.trim(), species_code: sp.value, size: sz.value }); name.value = ''; toast('Pet cadastrado'); await draw(); });
    setView(h('h2', {}, 'Meus pets'), host, h('form', { class: 'card', onsubmit: (e) => e.preventDefault() }, h('h3', {}, 'Novo pet'), h('div', { class: 'grid' }, field('Nome', name), field('Espécie', sp), field('Porte', sz)), h('p', {}, add)));
    await draw();
  }

  // ── pedidos (tutor e prestador) ─────────────────────────────────────────────
  async function viewPedidos(role) {
    const items = (await api('GET', `/me/requests?as=${role}`)).items;
    const list = items.length ? items.map((r) => h('article', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', {}, r.listing_title || 'Serviço'), badge(REQ_STATUS, r.status)),
      h('p', { class: 'muted' }, role === 'tutor' ? `Prestador: ${r.provider_name}` : `Tutor: ${r.tutor_name || '—'}`, ` · ${dt(r.period_from)} até ${dt(r.period_to)}`),
      h('p', {}, 'Pets: ' + petsText(r.pets)),
      r.latest_quote ? h('p', {}, `Última proposta: ${brl(r.latest_quote.total_cents)} (v${r.latest_quote.version}, ${QUOTE_STATUS[r.latest_quote.status]?.[0] || r.latest_quote.status})`) : null,
      btn('Abrir', () => viewPedido(r.id, role), 'secondary'))) : [h('div', { class: 'empty' }, role === 'tutor' ? 'Você ainda não fez pedidos. Use "Buscar serviços".' : 'Nenhum pedido recebido ainda. Peça para um tutor (ex.: Ana) solicitar seu serviço.')];
    setView(h('h2', {}, role === 'tutor' ? 'Meus pedidos' : 'Pedidos recebidos'), list);
  }
  const quoteBlock = (q) => h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('strong', {}, `Proposta v${q.version} — ${brl(q.total_cents)}`), badge(QUOTE_STATUS, q.status)),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'num' }, 'Qtd'), h('th', { class: 'num' }, 'Unitário'), h('th', { class: 'num' }, 'Total'))),
      h('tbody', {}, q.items.map((i) => h('tr', {}, h('td', {}, i.description), h('td', { class: 'num' }, i.quantity), h('td', { class: 'num' }, brl(i.unit_price_cents)), h('td', { class: 'num' }, brl(i.total_cents)))))),
    h('p', { class: 'muted' }, `Válida até ${dt(q.valid_until)}`, q.policy_snapshot && q.policy_snapshot.location ? ` · Local: ${q.policy_snapshot.location}` : '', ' · Cancelamento: política padrão cancel-v1'));
  async function viewPedido(id, role) {
    const r = await api('GET', '/me/requests/' + id);
    const back = btn('← Voltar', () => go(role === 'tutor' ? 'pedidos' : 'recebidos'), 'secondary');
    const parts = [back, h('h2', {}, r.listing_title || 'Pedido', ' ', badge(REQ_STATUS, r.status)),
      h('p', { class: 'muted' }, role === 'tutor' ? `Prestador: ${r.provider_name}` : `Tutor: ${r.tutor_name || '—'}`),
      h('p', {}, `Período: ${dt(r.period_from)} até ${dt(r.period_to)}`), h('p', {}, 'Pets: ' + petsText(r.pets)),
      r.message ? h('p', {}, 'Mensagem: ', h('em', {}, r.message)) : null,
      r.decline_reason ? h('p', { class: 'muted' }, 'Motivo da recusa: ' + r.decline_reason) : null];
    const open = ['open', 'discussing', 'quoted'].includes(r.status);
    if (role === 'tutor') {
      parts.push(h('h3', {}, 'Propostas'));
      if (!r.quotes.length) parts.push(h('div', { class: 'empty' }, 'Aguardando o prestador responder com uma proposta. Troque para a persona do prestador para enviar.'));
      for (const q of r.quotes) {
        const block = quoteBlock(q);
        if (q.status === 'sent' && new Date(q.valid_until) > new Date() && open) {
          block.append(h('p', {}, btn('Aceitar proposta e ir para o pagamento', async () => {
            let key = store.get('qas-idem-' + q.id); if (!key) { key = crypto.randomUUID(); store.set('qas-idem-' + q.id, key); }
            const a = await api('POST', `/me/quotes/${q.id}/accept`, {}, { 'idempotency-key': key });
            await api('POST', `/me/orders/${a.order_id}/pix`, {});
            toast('Proposta aceita. A vaga ficou reservada por 15 minutos: pague o Pix sandbox.'); go('reservas');
          })));
        }
        parts.push(block);
      }
      if (r.booking) parts.push(h('p', {}, 'Reserva: ', badge(BK_STATUS, r.booking.status), ' ', btn('Ir para reservas', () => go('reservas'), 'secondary')));
      if (open) parts.push(h('p', {}, btn('Cancelar pedido', async () => { await api('POST', `/me/requests/${id}/cancel`, {}); toast('Pedido cancelado'); viewPedido(id, role); }, 'danger')));
    } else {
      parts.push(h('p', { class: 'muted' }, 'Por privacidade, você vê apenas espécie e porte dos pets até a reserva ser confirmada.'));
      if (r.quotes.length) parts.push(h('h3', {}, 'Propostas enviadas'), ...r.quotes.map(quoteBlock));
      if (r.booking) parts.push(h('p', {}, 'Reserva: ', badge(BK_STATUS, r.booking.status), ' ', btn('Ir para reservas', () => go('agenda'), 'secondary')));
      if (open) parts.push(await quoteForm(r), declineForm(r));
    }
    setView(parts);
  }
  async function quoteForm(r) {
    const prov = await api('GET', '/me/provider');
    const listing = prov.listings.find((l) => l.id === r.listing_id);
    const ms = new Date(r.period_to) - new Date(r.period_from);
    const unit = listing ? listing.price_unit : 'service';
    const qty = unit === 'night' || unit === 'day' ? Math.max(1, Math.ceil(ms / 86_400_000)) : 1;
    const rows = h('div'); const totalEl = h('strong');
    const recalc = () => {
      let t = 0; rows.querySelectorAll('.itemrow').forEach((row) => { const q = Number(row.querySelector('[name=qty]').value); const v = parseMoney(row.querySelector('[name=price]').value); if (q > 0 && Number.isFinite(v)) t += q * v; });
      totalEl.textContent = brl(t);
    };
    const addRow = (d, q, p) => {
      const row = h('div', { class: 'itemrow' },
        field('Descrição', h('input', { name: 'desc', maxlength: '120', value: d, oninput: recalc })),
        field('Qtd', h('input', { name: 'qty', type: 'number', min: '1', max: '365', value: String(q), oninput: recalc })),
        field('Valor unit. (R$)', h('input', { name: 'price', inputmode: 'decimal', value: p, oninput: recalc })),
        h('button', { type: 'button', class: 'btn danger', 'aria-label': 'Remover item', onclick: () => { row.remove(); recalc(); } }, '×'));
      rows.append(row); recalc();
    };
    addRow(listing ? listing.title : 'Serviço', qty, listing ? (listing.price_cents / 100).toFixed(2).replace('.', ',') : '');
    const validity = sel('hours', [['24', '24 horas'], ['48', '48 horas'], ['72', '72 horas'], ['168', '7 dias']], '48');
    const where = h('input', { name: 'where', maxlength: '200', placeholder: 'Ex.: na casa da prestadora, bairro Centro' });
    const send = btn(r.quotes.some((q) => q.status === 'sent') ? 'Enviar nova versão da proposta' : 'Enviar proposta', async () => {
      const items = [...rows.querySelectorAll('.itemrow')].map((row) => ({ description: row.querySelector('[name=desc]').value.trim(), quantity: Number(row.querySelector('[name=qty]').value), unit_price_cents: parseMoney(row.querySelector('[name=price]').value) }));
      if (!items.length) throw new Error('Inclua ao menos um item');
      if (items.some((i) => !i.description || !(i.quantity >= 1) || !Number.isFinite(i.unit_price_cents))) throw new Error('Confira descrição, quantidade e valor de cada item (valor em reais, ex.: 120,00)');
      await api('POST', `/me/requests/${r.id}/quotes`, { items, valid_hours: Number(validity.value), location: where.value });
      toast('Proposta enviada ao tutor'); viewPedido(r.id, 'provider');
    });
    return h('form', { class: 'card', onsubmit: (e) => e.preventDefault() }, h('h3', {}, 'Enviar proposta'), rows,
      h('p', {}, h('button', { type: 'button', class: 'btn secondary', onclick: () => addRow('', 1, '') }, '+ Adicionar item')),
      h('div', { class: 'grid' }, field('Validade da proposta', validity), field('Local do serviço', where)),
      h('p', {}, 'Total: ', totalEl), h('p', { class: 'muted' }, 'A plataforma retém comissão sobre o valor pago; o cálculo é feito pelo servidor.'), h('p', {}, send));
  }
  function declineForm(r) {
    const reason = h('input', { name: 'reason', maxlength: '300', placeholder: 'Motivo (opcional)' });
    return h('div', { class: 'card' }, h('h3', {}, 'Não consigo atender'), field('Motivo', reason),
      h('p', {}, btn('Recusar pedido', async () => { await api('POST', `/me/requests/${r.id}/decline`, { reason: reason.value }); toast('Pedido recusado'); go('recebidos'); }, 'danger')));
  }

  // ── reservas (tutor e prestador) ────────────────────────────────────────────
  const PROVIDER_ACTIONS = {
    confirmed: [['ready', 'Marcar como pronta', ''], ['no_show', 'Cliente não compareceu', 'danger'], ['cancelled', 'Cancelar', 'danger']],
    ready: [['in_progress', 'Iniciar atendimento', ''], ['no_show', 'Cliente não compareceu', 'danger'], ['cancelled', 'Cancelar', 'danger']],
    in_progress: [['completed', 'Concluir atendimento', ''], ['interrupted', 'Interromper', 'danger']],
    interrupted: [['completed', 'Concluir atendimento', ''], ['cancelled', 'Cancelar', 'danger']],
  };
  async function viewReservas(role) {
    const items = (await api('GET', `/me/bookings?as=${role}`)).items;
    const list = items.length ? items.map((b) => bookingCard(b, role)) : [h('div', { class: 'empty' }, 'Nenhuma reserva ainda.')];
    setView(h('h2', {}, role === 'tutor' ? 'Minhas reservas' : 'Reservas'), list);
  }
  function bookingCard(b, role) {
    const commission = Math.floor((b.total_cents * b.commission_bps + 5000) / 10000);
    const card = h('article', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', {}, b.listing_title || 'Serviço'), badge(BK_STATUS, b.status)),
      h('p', { class: 'muted' }, role === 'tutor' ? `Prestador: ${b.provider_name}` : `Tutor: ${b.tutor_name || '—'}`, ` · ${dt(b.period_from)} até ${dt(b.period_to)}`),
      h('p', {}, 'Pets: ' + petsText(b.pets)),
      h('p', {}, `Total: ${brl(b.total_cents)}`, role === 'provider' ? h('span', { class: 'muted' }, ` · comissão da plataforma ${brl(commission)} (${(b.commission_bps / 100).toFixed(1).replace('.', ',')}%) · você recebe, estimado: ${brl(b.total_cents - commission)}`) : null));
    const reload = () => go(role === 'tutor' ? 'reservas' : 'agenda');
    if (role === 'tutor') {
      if (b.status === 'awaiting_payment') card.append(paymentPanel(b, reload));
      if (['awaiting_payment', 'confirmed', 'ready'].includes(b.status)) card.append(h('p', {}, btn('Cancelar reserva', async () => { await api('POST', `/me/bookings/${b.id}/status`, { to: 'cancelled' }); toast('Reserva cancelada'); reload(); }, 'danger')));
      if (b.status === 'completed') card.append(b.has_review ? h('p', {}, badge({ r: ['Você já avaliou', 'ok'] }, 'r')) : reviewForm(b, reload));
      const last = store.get('qas-last-evt-' + b.id);
      if (last && b.status !== 'awaiting_payment') {
        const { payment_id, event_id } = JSON.parse(last);
        card.append(h('details', {}, h('summary', {}, 'Ferramentas de QA'), h('p', {}, btn('Reenviar o mesmo aviso de pagamento (teste de duplicidade)', async () => {
          const res = await api('POST', `/me/payments/${payment_id}/simulate`, { event_id });
          toast(`Webhook ${res.http_status}: duplicado = ${res.webhook.duplicate ? 'sim' : 'não'}; resultado = ${res.webhook.processed}`);
        }, 'secondary'))));
      }
    } else if (b.status === 'awaiting_payment') {
      card.append(h('p', { class: 'muted' }, 'Aguardando o tutor pagar. A vaga fica reservada por 15 minutos.'));
    } else {
      const row = h('div', { class: 'row' });
      for (const [to, label, cls] of PROVIDER_ACTIONS[b.status] || []) row.append(btn(label, async () => { await api('POST', `/me/bookings/${b.id}/status`, { to }); toast('Status atualizado'); reload(); }, cls));
      card.append(row);
    }
    return card;
  }
  function paymentPanel(b, reload) {
    const box = h('div', { class: 'card pay' }, h('h3', {}, 'Pagamento — Pix SANDBOX (não paga de verdade)'));
    const resultEl = h('p', { class: 'muted', 'aria-live': 'polite' });
    if (!b.pending_payment_id) {
      box.append(h('p', {}, 'Ainda não há cobrança para esta reserva.'), h('p', {}, btn('Gerar Pix sandbox', async () => { await api('POST', `/me/orders/${b.order.id}/pix`, {}); reload(); })));
      return box;
    }
    const countdown = h('strong');
    const tick = () => {
      const ms = new Date(b.pending_payment_expires_at) - Date.now();
      countdown.textContent = ms > 0 ? `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}` : 'prazo encerrado';
    };
    tick(); state.timers.push(setInterval(tick, 1000));
    box.append(h('p', {}, `Valor: ${brl(b.total_cents)} · a vaga fica reservada por mais `, countdown),
      h('div', { class: 'pix', 'aria-label': 'Código Pix copia e cola (sandbox)' }, `SANDBOX-PIX-NAO-PAGAVEL-${b.pending_payment_id}`),
      h('div', { class: 'row' },
        btn('Simular pagamento aprovado (sandbox)', async () => {
          const res = await api('POST', `/me/payments/${b.pending_payment_id}/simulate`, {});
          store.set('qas-last-evt-' + b.id, JSON.stringify({ payment_id: b.pending_payment_id, event_id: res.event_id }));
          toast(`PSP sandbox avisou o pagamento (webhook ${res.http_status}: ${res.webhook.processed})`); reload();
        }),
        btn('Expirar reserva agora (teste)', async () => { await api('POST', `/me/bookings/${b.id}/qas-expire-hold`, {}); toast('Reserva expirada: vaga liberada e pedido encerrado'); reload(); }, 'danger')), resultEl);
    return box;
  }
  function reviewForm(b, reload) {
    const mk = (name) => sel(name, [['5', '5 — excelente'], ['4', '4 — bom'], ['3', '3 — regular'], ['2', '2 — ruim'], ['1', '1 — péssimo']], '5');
    const c = mk('c'), p = mk('p'), k = mk('k'), m = mk('m');
    const comment = h('textarea', { maxlength: '1000', placeholder: 'Conte como foi (opcional)' });
    return h('form', { class: 'card', onsubmit: (e) => e.preventDefault() }, h('h3', {}, 'Avaliar atendimento'),
      h('div', { class: 'grid' }, field('Comunicação', c), field('Pontualidade', p), field('Cuidado com o pet', k), field('Combinou com o anunciado', m)), field('Comentário', comment),
      h('p', {}, btn('Enviar avaliação', async () => { await api('POST', `/me/bookings/${b.id}/review`, { communication: +c.value, punctuality: +p.value, care: +k.value, match: +m.value, comment: comment.value || undefined }); toast('Avaliação publicada'); reload(); })));
  }

  // ── PRESTADOR: painel e avaliações ──────────────────────────────────────────
  async function viewPainel() {
    const d = await api('GET', '/me/provider');
    const e = d.earnings_estimate;
    const money = (x) => h('td', { class: 'num' }, brl(x));
    setView(h('h2', {}, d.provider.public_name), h('p', { class: 'muted' }, `Perfil ${d.provider.status === 'published' ? 'publicado' : d.provider.status} · plano ${d.plan.plan_code} (${d.plan.status}) · `, d.rating.avg == null ? 'ainda sem avaliações' : `★ ${d.rating.avg.toFixed(1).replace('.', ',')} (${d.rating.count})`),
      h('p', {}, btn('Ver meu perfil público', () => viewProfile(d.provider.slug, false, () => go('painel')), 'secondary')),
      h('h3', {}, 'Meus serviços'),
      d.listings.map((l) => h('div', { class: 'card' }, h('strong', {}, l.title), h('div', { class: 'muted' }, `${CAT_NAME[l.category_code] || l.category_code} · ${l.price_is_from ? 'a partir de ' : ''}${brl(l.price_cents)}/${UNIT[l.price_unit] || l.price_unit} · ${l.status}`))),
      h('h3', {}, 'Ganhos (estimativa)'),
      h('div', { class: 'card' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'num' }, 'Bruto'), h('th', { class: 'num' }, 'Comissão'), h('th', { class: 'num' }, 'Líquido'))),
        h('tbody', {}, h('tr', {}, h('td', {}, 'Concluídas'), money(e.completed.gross), money(e.completed.commission), money(e.completed.net)),
          h('tr', {}, h('td', {}, 'Pagas, a realizar'), money(e.in_progress.gross), money(e.in_progress.commission), money(e.in_progress.net)))), h('p', { class: 'muted' }, e.note)));
  }
  async function viewAvaliacoes() {
    const items = (await api('GET', '/me/provider/reviews')).items;
    const list = items.length ? items.map((r) => {
      const avg = (r.score_communication + r.score_punctuality + r.score_care + r.score_match) / 4;
      const card = h('article', { class: 'card' }, stars(avg), ` ${dt(r.created_at)}`, r.comment ? h('p', {}, r.comment) : h('p', { class: 'muted' }, 'Sem comentário.'));
      if (r.provider_reply) card.append(h('p', { class: 'muted' }, 'Sua resposta: ' + r.provider_reply));
      else { const t = h('input', { maxlength: '1000', placeholder: 'Responder publicamente' }); card.append(field('Resposta', t), h('p', {}, btn('Responder', async () => { if (!t.value.trim()) throw new Error('Escreva a resposta'); await api('POST', `/me/reviews/${r.id}/reply`, { text: t.value }); toast('Resposta publicada'); go('avaliacoes'); }, 'secondary'))); }
      return card;
    }) : [h('div', { class: 'empty' }, 'Nenhuma avaliação recebida. Conclua uma reserva e peça para o tutor (ex.: Ana) avaliar.')];
    setView(h('h2', {}, 'Avaliações recebidas'), list);
  }

  // ── início ──────────────────────────────────────────────────────────────────
  async function init() {
    const select = $('#persona');
    for (const [k, t] of PERSONAS) select.append(h('option', { value: k }, t));
    const saved = store.get('qas-persona');
    select.value = PERSONAS.some(([k]) => k === saved) ? saved : 'ana';
    select.addEventListener('change', () => loadPersona(select.value).catch((e) => toast(e.message, true)));
    try { await loadPersona(select.value); } catch (e) { setView(h('div', { class: 'card' }, h('h2', {}, 'Não foi possível iniciar'), h('p', {}, e.message))); }
  }
  init();
})();
