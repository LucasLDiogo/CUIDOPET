// Teste do firebaseAdapter.ts + firestore.rules contra os emuladores (auth :9099, firestore :8080).
// Rodar na raiz do repositório (precisa de Java + firebase-tools; NÃO são dependências do app):
//   npx firebase-tools emulators:exec --only firestore,auth --project demo-cuidope "node tests/firebase/adapter-e-rules.mjs"
// O adaptador é carregado de verdade via Vite SSR (apps/web/node_modules/vite). Dados 100% fictícios.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/web');
const PROJECT = 'demo-cuidope';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const PW = 'Cuidope!Demo2026';
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'fake-api-key', VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_APP_ID: '1:1:web:1', VITE_FIREBASE_USE_EMULATOR: 'true', VITE_DEMO_LOGIN: 'true', VITE_DEMO_PASSWORD: PW,
});

let passed = 0;
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); passed++; console.log('ok ', m); };
const expectErr = async (p, m, code) => {
  try { await p; } catch (e) { if (code && e.code !== code) throw new Error(`FALHOU: ${m} (veio ${e.code}: ${e.message})`); passed++; console.log('ok ', m, `[${e.code ?? 'erro'}]`); return; }
  throw new Error('FALHOU (sem erro): ' + m);
};

/* ---------- REST helpers ---------- */
const toV = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === 'string' ? { stringValue: v } : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(toV) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toV(x)])) } };
const fromV = (v) => 'nullValue' in v ? null : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'stringValue' in v ? v.stringValue : 'timestampValue' in v ? new Date(v.timestampValue) : 'arrayValue' in v ? (v.arrayValue.values ?? []).map(fromV)
  : Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromV(x)]));
async function put(path, data, token = 'owner', mask) {
  const qs = mask ? '?' + mask.map((f) => `updateMask.fieldPaths=${f}`).join('&') : '';
  const r = await fetch(`${FS}/${path}${qs}`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toV(v)])) }) });
  return r.status;
}
async function get(path, token) {
  const r = await fetch(`${FS}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, data: r.ok ? fromV({ mapValue: await r.json() }) : null };
}
async function signUp(email) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) });
  return r.json();
}
async function token(email) {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) });
  return (await r.json()).idToken;
}

/* ---------- seed (owner = ignora rules) ---------- */
const ana = await signUp('ana.demo@cuidope.app');
const carla = await signUp('carla.demo@cuidope.app');
const intruso = await signUp('intruso@exemplo.com.br');
const now = new Date().toISOString();
const provider = (id, owner, name) => ({
  slug: id, ownerUserId: owner, name, kind: 'autonomo', tagline: 'Teste', bio: '', categories: ['passeio', 'hospedagem'], cityId: 'passo-fundo-rs', neighborhood: 'Centro',
  geo: { lat: -28.26, lng: -52.4 }, avatarSeed: 1, coverSeed: 2, rating: null, reviewCount: 0, ratingBreakdown: [0, 0, 0, 0, 0], responseTimeMin: 10, responseRate: 0.9,
  verification: { identity: true, background: false, venue: false }, yearsExperience: 3, petsServed: 10, species: ['cao', 'gato'], sizes: ['mini', 'pequeno', 'medio', 'grande', 'gigante'],
  priceFromCents: 4800, whatsappOptIn: false, openingHours: [{ day: 1, open: '08:00', close: '19:00' }], amenities: [], cancellationPolicy: 'flexivel', plan: 'pro',
  featured: true, status: 'publicado', isDemo: true, createdAt: now,
});
await put(`users/${carla.localId}`, { role: 'prestador', name: 'Carla', providerId: 'carla', createdAt: now });
await put('providers/carla', provider('casa-da-carla', carla.localId, 'Casa da Carla'));
await put('providers/outro', provider('outro-prestador', 'uid-outro', 'Outro Prestador'));
await put('settings/carla', { waNumber: '+5554996681234', waProvider: 'cloud_api', waConnected: true, autoConfirmationRequest: true, reminder24h: true, reminder2h: false,
  postServiceReview: true, reactivationDays: 30, firstResponseSlaMin: 15, autoReplyOutsideHours: false, instantBooking: false, ownerUid: carla.localId });
const svc = (pid, owner, extra) => ({ providerId: pid, ownerUid: owner, description: '', species: ['cao'], sizes: ['mini', 'pequeno', 'medio', 'grande', 'gigante'], active: true, ...extra });
await put('services/svc-passeio', svc('carla', carla.localId, { category: 'passeio', name: 'Passeio 60 min', priceCents: 4800, unit: 'passeio', durationMin: 60 }));
await put('services/svc-hosp', svc('carla', carla.localId, { category: 'hospedagem', name: 'Diária', priceCents: 9500, unit: 'diaria', durationMin: 1440 }));
await put('services/svc-outro', svc('outro', 'uid-outro', { category: 'passeio', name: 'Passeio', priceCents: 3000, unit: 'passeio', durationMin: 30 }));
await put('templates/tpl-confirmacao', { name: 'confirmacao_agendamento', title: 'Pedir confirmação', category: 'utility', body: 'Oi {{nome}}', buttons: ['Confirmar'], approved: true });

/* ---------- adaptador real via Vite SSR ---------- */
const { createServer } = await import(pathToFileURL(resolve(WEB, 'node_modules/vite/dist/node/index.js')).href);
const vite = await createServer({ root: WEB, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { createFirebaseRepository } = await vite.ssrLoadModule('/src/data/firebaseAdapter.ts');
const repo = createFirebaseRepository();
ok(repo.backend === 'firebase', 'createFirebaseRepository() cria o repositório');

// visitante
const cards = await repo.searchProviders({});
ok(cards.length === 2 && cards[0].cityName === 'Passo Fundo/RS', 'anônimo: busca pública retorna 2 publicados');
const detail = await repo.getProviderDetail('casa-da-carla');
ok(detail?.services.length === 2, 'anônimo: detalhe com serviços ativos');
ok((await get(`customers/${ana.localId}`)).status === 403, 'anônimo NÃO lê customers (REST 403)');

// tutora
const s1 = await repo.signInDemo('tutor');
ok(s1.role === 'tutor' && s1.customerId === ana.localId, 'Ana entra pelo login demo (signInWithEmailAndPassword)');
const me = await repo.getMe();
ok(me?.customer.id === ana.localId, 'getMe cria users/customers no primeiro acesso (rules de create)');
const thor = await repo.savePet({ name: 'Thor', species: 'cao', breed: 'Golden', size: 'grande', birthYear: 2021, weightKg: 32, temperament: 'Dócil', careNotes: '', vaccinesUpToDate: true });
ok(!!thor.id, 'savePet cria pet');
const start = new Date(Date.now() + 2 * 86400000); start.setHours(10, 0, 0, 0);
const booking = await repo.createBooking({ providerId: 'carla', serviceId: 'svc-passeio', petIds: [thor.id], start: start.toISOString(), notes: 'teste', location: 'casa_tutor',
  contact: { name: 'Ana Paula Ribeiro', phone: '(54) 99123-4567', email: 'ana.demo@cuidope.app', waOptIn: true, marketingOptIn: false } });
ok(booking.status === 'pendente' && booking.priceCents === 4800, 'createBooking: pendente com preço do serviço (rules validam)');
ok((await repo.listMyBookings()).length === 1, 'listMyBookings retorna a reserva com prestador/serviço');
ok((await repo.toggleFavorite('carla')).includes('carla'), 'toggleFavorite');
await expectErr(repo.replyConfirmation(booking.id, 'SIM'), 'não confirma reserva que não está aguardando', 'conflito');

const tAna = await token('ana.demo@cuidope.app');
ok(await put(`bookings/${booking.id}`, { priceCents: 0 }, tAna, ['priceCents']) === 403, 'tutor NÃO altera preço (REST 403)');
ok(await put(`bookings/${booking.id}`, { status: 'confirmado' }, tAna, ['status']) === 403, 'tutor NÃO altera status direto (REST 403)');
ok(await put('providers/carla', { rating: 5 }, tAna, ['rating']) === 403, 'tutor NÃO altera nota do prestador (REST 403)');
const raw = (await get(`bookings/${booking.id}`, 'owner')).data;
ok(await put('bookings/fraude1', { ...raw, priceCents: 100, code: 'CP-999999' }, tAna) === 403, 'reserva com preço adulterado é negada (REST 403)');
ok(await put('bookings/fraude2', { ...raw, status: 'confirmado', code: 'CP-999998' }, tAna) === 403, 'reserva já "confirmada" pelo tutor é negada');
ok(await put('bookings/fraude3', { ...raw, serviceId: 'svc-hosp', code: 'CP-999997' }, tAna) === 403, 'reserva com serviço/preço incoerente é negada');
const tIntruso = await token('intruso@exemplo.com.br');
ok((await get(`bookings/${booking.id}`, tIntruso)).status === 403, 'outro usuário NÃO lê a reserva');
ok((await get(`pets/${thor.id}`, tIntruso)).status === 403, 'outro usuário NÃO lê o pet');
ok((await get(`customers/${ana.localId}`, tIntruso)).status === 403, 'outro usuário NÃO lê o cliente');
ok(await put(`users/${intruso.localId}`, { role: 'prestador', name: 'x', providerId: 'carla', createdAt: now }, tIntruso) === 403, 'ninguém se promove a prestador de provider alheio');

// prestadora
await repo.signOut();
const s2 = await repo.signInDemo('prestador');
ok(s2.role === 'prestador' && s2.providerId === 'carla', 'Carla entra como prestadora');
const pb = await repo.listProviderBookings();
ok(pb.length === 1 && pb[0].customer.name === 'Ana Paula Ribeiro' && pb[0].pets[0]?.name === 'Thor', 'Carla vê a reserva, o cliente e o pet vinculados');
ok((await repo.updateBookingStatus(booking.id, 'aguardando_cliente')).status === 'aguardando_cliente', 'Carla aceita (pendente → aguardando_cliente)');
await expectErr(repo.updateBookingStatus(booking.id, 'concluido'), 'transição inválida recusada no cliente', 'conflito');
const tCarla = await token('carla.demo@cuidope.app');
const rawB = (await get(`bookings/${booking.id}`, 'owner')).data;
ok(await put(`bookings/${booking.id}`, { status: 'concluido', timeline: [...rawB.timeline, { at: now, type: 'concluido', label: 'x', by: 'prestador' }] }, tCarla, ['status', 'timeline']) === 403,
  'rules recusam transição inválida (aguardando_cliente → concluido)');
ok(await put('providers/carla', { status: 'suspenso' }, tCarla, ['status']) === 403, 'prestador NÃO muda o próprio status');
ok(await put('providers/carla', { featured: false }, tCarla, ['featured']) === 403, 'prestador NÃO mexe em destaque');
ok(await put('services/svc-x', svc('outro', carla.localId, { category: 'passeio', name: 'Fake', priceCents: 1, unit: 'passeio', durationMin: 30 }), tCarla) === 403,
  'prestador NÃO cria serviço em provider alheio');
ok((await repo.updateMyProvider({ tagline: 'Nova tagline' })).tagline === 'Nova tagline', 'updateMyProvider (campos de perfil)');
ok(!!(await repo.saveService({ category: 'pet_sitter', name: 'Visita 40 min', description: '', priceCents: 5500, unit: 'visita', durationMin: 40, species: ['cao', 'gato'], sizes: ['mini', 'medio'], active: true })).id,
  'saveService cria serviço próprio');
ok((await repo.listCustomers()).length === 1, 'listCustomers (clientes vinculados)');
const dash = await repo.getDashboard();
ok(typeof dash.monthRevenueCents === 'number' && Array.isArray(dash.weekly), 'getDashboard calcula indicadores');

// tutora confirma
await repo.signOut();
await repo.signInDemo('tutor');
ok((await repo.replyConfirmation(booking.id, 'SIM')).status === 'confirmado', 'Ana confirma (aguardando_cliente → confirmado)');

// prestadora conclui
await repo.signOut();
await repo.signInDemo('prestador');
await repo.updateBookingStatus(booking.id, 'em_atendimento');
ok((await repo.updateBookingStatus(booking.id, 'concluido')).status === 'concluido', 'Carla conclui o atendimento');

// avaliação
await repo.signOut();
await repo.signInDemo('tutor');
const rev = await repo.submitReview(booking.id, { rating: 5, aspects: { pontualidade: 5, cuidado: 5, comunicacao: 4 }, text: 'Ótimo!' });
ok(rev.authorName === 'Ana R.' && rev.id === booking.id, 'submitReview (1 por reserva, autor minimizado)');
await expectErr(repo.submitReview(booking.id, { rating: 1, aspects: { pontualidade: 1, cuidado: 1, comunicacao: 1 }, text: 'de novo' }), 'segunda avaliação recusada', 'conflito');
const tAna2 = await token('ana.demo@cuidope.app');
ok(await put(`reviews/${booking.id}`, { rating: 1 }, tAna2, ['rating']) === 403, 'tutor NÃO edita a nota depois de publicada');

await repo.signOut();
await repo.signInDemo('prestador');
ok((await repo.replyReview(booking.id, 'Obrigada!')).reply?.text === 'Obrigada!', 'Carla responde a avaliação');
ok(await put(`reviews/${booking.id}`, { rating: 2 }, tCarla, ['rating']) === 403, 'prestador NÃO altera a nota da avaliação');

await repo.signOut();
await vite.close();
console.log(`\n${passed} verificações OK (Firebase emulador)`);
process.exit(0);
