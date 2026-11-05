/**
 * Adaptador DEMO: todos os dados vivem no navegador (localStorage), gerados por seed.ts.
 * Aplica as MESMAS regras do servidor (transições, preço, capacidade, dono do recurso) para que a
 * demonstração se comporte como o produto real. Simula o WhatsApp (entregue/lido/respostas).
 */
import type {
  Booking, BookingStatus, Conversation, ConversationStatus, Customer, CustomerRow, ID, Message, NewBookingInput,
  Pet, Provider, ProviderCard, Review, SearchFilters, Service, ServicePackage, Session, WaTemplate,
} from '../domain/types';
import { AppError, type ProviderBooking, type Repository, type TutorBooking } from './repository';
import { CATEGORIES, CITIES } from './demo/catalog';
import { DEMO_VERSION, MAIN_CUSTOMER_ID, MAIN_PROVIDER_ID, generateDemo, type DemoDB } from './demo/seed';
import { bookingPriceCents, CAPACITY, canTransition, daySlots, fillTemplate, rankReason, rankScore, toE164 } from '../domain/rules';
import { computeDashboard } from './dashboard';

const KEY = 'cuidope.demo.db';
const SKEY = 'cuidope.demo.session';
const ACTIVE: BookingStatus[] = ['pendente', 'aguardando_cliente', 'confirmado', 'em_atendimento'];

function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* modo privado: segue em memória */ } }
function safeDel(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(x: T): T => structuredClone(x);
const nowISO = () => new Date().toISOString();
const fmtDay = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const fmtHour = (d: Date) => d.toTimeString().slice(0, 5);

export function createDemoRepository(): Repository {
  let db: DemoDB = load();
  let session: Session | null = (() => { try { const s = safeGet(SKEY); return s ? (JSON.parse(s) as Session) : null; } catch { return null; } })();
  const listeners = new Set<() => void>();
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  function load(): DemoDB {
    try {
      const raw = safeGet(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDB;
        // demo velha (mais de 3 dias) é regenerada para continuar parecendo "de hoje"
        if (parsed.version === DEMO_VERSION && Date.now() - Date.parse(parsed.seededAt) < 3 * 86400000) return parsed;
      }
    } catch { /* corrompido → regenera */ }
    const fresh = generateDemo(new Date());
    safeSet(KEY, JSON.stringify(fresh));
    return fresh;
  }
  function changed() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => safeSet(KEY, JSON.stringify(db)), 150);
    listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  }
  const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  /* ---------- guards ---------- */
  function requireTutor(): Customer {
    if (!session || session.role !== 'tutor' || !session.customerId) throw new AppError('nao_autenticado', 'Entre como tutor para continuar.');
    const c = db.customers.find((x) => x.id === session!.customerId);
    if (!c) throw new AppError('nao_encontrado', 'Cadastro do tutor não encontrado.');
    return c;
  }
  function requireProvider(): Provider {
    if (!session || session.role !== 'prestador' || !session.providerId) throw new AppError('nao_autenticado', 'Entre como prestador para acessar o painel.');
    const p = db.providers.find((x) => x.id === session!.providerId);
    if (!p) throw new AppError('nao_encontrado', 'Perfil de prestador não encontrado.');
    return p;
  }
  const settingsOf = (pid: ID) => {
    let s = db.settings.find((x) => x.providerId === pid);
    if (!s) {
      s = { providerId: pid, waNumber: '', waProvider: 'desconectado', waConnected: false, autoConfirmationRequest: true, reminder24h: true, reminder2h: false, postServiceReview: true, reactivationDays: 30, firstResponseSlaMin: 15, autoReplyOutsideHours: false, instantBooking: false };
      db.settings.push(s);
    }
    return s;
  };
  const tpl = (name: string) => db.templates.find((t) => t.name === name)!;
  const cityName = (id: ID) => CITIES.find((c) => c.id === id)?.name ?? id;

  /* ---------- WhatsApp simulado ---------- */
  function conversationFor(providerId: ID, customer: Customer): Conversation {
    let c = db.conversations.find((x) => x.providerId === providerId && x.customerId === customer.id);
    if (!c) {
      c = { id: uid('cnv'), providerId, customerId: customer.id, phone: customer.phone, status: 'novo', tags: [], unread: 0, lastMessageAt: nowISO(), lastMessagePreview: '' };
      db.conversations.unshift(c);
    }
    return c;
  }
  function pushMessage(conv: Conversation, from: Message['from'], text: string, extra: Partial<Message> = {}): Message {
    const m: Message = { id: uid('msg'), conversationId: conv.id, from, text, at: nowISO(), delivery: from === 'cliente' || from === 'sistema' ? 'lido' : 'enviando', ...extra };
    db.messages.push(m);
    conv.lastMessageAt = m.at; conv.lastMessagePreview = text.slice(0, 90);
    if (from === 'cliente') conv.unread += 1;
    if (m.delivery === 'enviando') {
      setTimeout(() => { m.delivery = 'entregue'; changed(); }, 700);
      setTimeout(() => { m.delivery = 'lido'; changed(); }, 2600);
    }
    return m;
  }
  function vars(b: Booking) {
    const c = db.customers.find((x) => x.id === b.customerId)!;
    const p = db.providers.find((x) => x.id === b.providerId)!;
    const s = db.services.find((x) => x.id === b.serviceId)!;
    const pets = db.pets.filter((x) => b.petIds.includes(x.id)).map((x) => x.name).join(' e ') || 'seu pet';
    const d = new Date(b.start);
    return { nome: c.name.split(' ')[0], pet: pets, servico: s.name, data: fmtDay(d), hora: fmtHour(d), prestador: p.name, codigo: b.code };
  }
  function sendTemplate(b: Booking, name: string) {
    const t = tpl(name);
    const c = db.customers.find((x) => x.id === b.customerId)!;
    if (!c.waOptIn && t.category === 'utility') return null; // sem opt-in, nada de WhatsApp
    if (t.category === 'marketing' && !c.marketingOptIn) return null;
    const conv = conversationFor(b.providerId, c);
    conv.bookingId = b.id;
    return pushMessage(conv, 'bot', fillTemplate(t.body, vars(b)), { template: t.name, buttons: t.buttons.length ? t.buttons : undefined });
  }
  function event(b: Booking, type: Booking['timeline'][number]['type'], label: string, by: Booking['timeline'][number]['by']) {
    b.timeline.push({ at: nowISO(), type, label, by });
  }

  function transition(b: Booking, to: BookingStatus, by: 'tutor' | 'prestador' | 'whatsapp' | 'sistema', note?: string) {
    if (!canTransition(b.status, to)) throw new AppError('conflito', `Não é possível passar de "${b.status}" para "${to}".`);
    const customer = db.customers.find((c) => c.id === b.customerId)!;
    const conv = conversationFor(b.providerId, customer);
    b.status = to;
    const st = settingsOf(b.providerId);
    switch (to) {
      case 'aguardando_cliente':
        event(b, to, 'Aceito pelo prestador — confirmação enviada no WhatsApp', by);
        b.waConfirmation = { sentAt: nowISO() };
        sendTemplate(b, 'confirmacao_agendamento');
        conv.status = 'aguardando_cliente'; conv.slaDueAt = undefined;
        // clientes simulados respondem sozinhos (a Ana responde pelo app do tutor)
        if (b.customerId !== MAIN_CUSTOMER_ID) setTimeout(() => { try { tutorReply(b.id, 'SIM'); changed(); } catch { /* já mudou */ } }, 6500);
        break;
      case 'confirmado':
        event(b, to, by === 'whatsapp' ? 'Tutor confirmou pelo WhatsApp' : by === 'tutor' ? 'Tutor confirmou pelo app' : 'Confirmado pelo prestador', by);
        pushMessage(conv, 'sistema', `Agendamento ${b.code} confirmado ✓`);
        conv.status = 'agendado';
        break;
      case 'em_atendimento':
        event(b, to, 'Check-in do pet', by);
        pushMessage(conv, 'bot', `${vars(b).pet} chegou e já está sendo cuidado(a) 🐾`);
        break;
      case 'concluido':
        event(b, to, 'Atendimento concluído', by);
        if (st.postServiceReview) sendTemplate(b, 'pos_atendimento_avaliacao');
        conv.status = 'resolvido';
        break;
      case 'recusado':
      case 'cancelado':
        event(b, to, note ? `${to === 'recusado' ? 'Recusado' : 'Cancelado'}: ${note}` : to === 'recusado' ? 'Recusado pelo prestador' : 'Cancelado', by);
        pushMessage(conv, by === 'tutor' || by === 'whatsapp' ? 'sistema' : 'bot', `Agendamento ${b.code} ${to === 'recusado' ? 'não pôde ser aceito' : 'cancelado'}${note ? ` — ${note}` : ''}.`);
        if (b.packagePurchaseId) { const pu = db.purchases.find((x) => x.id === b.packagePurchaseId); if (pu) { pu.sessionsUsed = Math.max(0, pu.sessionsUsed - 1); pu.status = 'ativo'; } }
        conv.status = 'resolvido';
        break;
      case 'nao_compareceu':
        event(b, to, 'Pet não compareceu', by);
        break;
      case 'pendente':
        event(b, to, 'Tutor pediu para remarcar', by);
        conv.status = 'aguardando_atendimento';
        break;
    }
  }

  function tutorReply(bookingId: ID, reply: 'SIM' | 'NAO' | 'REMARCAR') {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) throw new AppError('nao_encontrado', 'Agendamento não encontrado.');
    if (b.status !== 'aguardando_cliente') throw new AppError('conflito', 'Este agendamento não está aguardando confirmação.');
    const customer = db.customers.find((c) => c.id === b.customerId)!;
    const conv = conversationFor(b.providerId, customer);
    pushMessage(conv, 'cliente', reply === 'SIM' ? 'Confirmar' : reply === 'NAO' ? 'Cancelar' : 'Remarcar');
    b.waConfirmation = { ...(b.waConfirmation ?? { sentAt: nowISO() }), repliedAt: nowISO(), reply };
    if (reply === 'SIM') transition(b, 'confirmado', 'whatsapp');
    else if (reply === 'NAO') transition(b, 'cancelado', 'whatsapp', 'tutor recusou pelo WhatsApp');
    else transition(b, 'pendente', 'whatsapp');
    return b;
  }

  /* ---------- consultas ---------- */
  function card(p: Provider, f: SearchFilters): ProviderCard {
    return { ...p, rankReason: rankReason(p, f), hasPackages: db.packages.some((k) => k.providerId === p.id && k.active), cityName: cityName(p.cityId) };
  }
  function capacityUsed(providerId: ID, category: string, a: number, z: number, ignoreId?: ID) {
    return db.bookings
      .filter((b) => b.providerId === providerId && b.id !== ignoreId && ACTIVE.includes(b.status) && Date.parse(b.start) < z && Date.parse(b.end) > a)
      .filter((b) => db.services.find((s) => s.id === b.serviceId)?.category === category)
      .reduce((acc, b) => acc + Math.max(1, b.petIds.length), 0);
  }
  const withProv = (b: Booking): ProviderBooking => ({
    ...clone(b), customer: clone(db.customers.find((c) => c.id === b.customerId)!), service: clone(db.services.find((s) => s.id === b.serviceId)!), pets: clone(db.pets.filter((p) => b.petIds.includes(p.id))),
  });

  const repo: Repository = {
    backend: 'demo',

    async getSession() { return session ? clone(session) : null; },
    async signInDemo(role, who) {
      await delay(250);
      if (role === 'tutor') {
        const c = db.customers.find((x) => x.id === (who ?? MAIN_CUSTOMER_ID))!;
        session = { userId: `usr-${c.id}`, role, name: c.name, customerId: c.id };
      } else {
        const p = db.providers.find((x) => x.id === (who ?? MAIN_PROVIDER_ID))!;
        session = { userId: p.ownerUserId, role, name: p.name, providerId: p.id };
      }
      safeSet(SKEY, JSON.stringify(session)); changed();
      return clone(session);
    },
    async signInWithEmail(email) {
      await delay(400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AppError('invalido', 'Informe um e-mail válido.');
      return { sent: false, message: 'Na demonstração não enviamos e-mail. Use os botões "Entrar como tutor" ou "Entrar como prestador".' };
    },
    async signOut() { session = null; safeDel(SKEY); changed(); },

    async listCategories() { return clone(CATEGORIES); },
    async listCities() { return clone(CITIES); },
    async searchProviders(f) {
      await delay(180);
      const q = f.q?.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      let list = db.providers.filter((p) => p.status === 'publicado');
      if (f.cityId) list = list.filter((p) => p.cityId === f.cityId);
      if (f.neighborhood) list = list.filter((p) => p.neighborhood === f.neighborhood);
      if (f.category && f.category !== 'todos') list = list.filter((p) => p.categories.includes(f.category as never));
      if (f.species) list = list.filter((p) => p.species.includes(f.species!));
      if (f.size) list = list.filter((p) => p.sizes.includes(f.size!));
      if (f.minRating) list = list.filter((p) => (p.rating ?? 0) >= f.minRating!);
      if (f.maxPriceCents) list = list.filter((p) => p.priceFromCents <= f.maxPriceCents!);
      if (f.verifiedOnly) list = list.filter((p) => p.verification.identity);
      if (f.withPackages) list = list.filter((p) => db.packages.some((k) => k.providerId === p.id && k.active));
      if (q) {
        list = list.filter((p) => {
          const svc = db.services.filter((s) => s.providerId === p.id).map((s) => s.name).join(' ');
          return `${p.name} ${p.tagline} ${p.neighborhood} ${svc}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
        });
      }
      const sort = f.sort ?? 'relevancia';
      list.sort((a, b) =>
        sort === 'avaliacao' ? (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount
        : sort === 'preco' ? a.priceFromCents - b.priceFromCents
        : sort === 'resposta' ? a.responseTimeMin - b.responseTimeMin
        : rankScore(b) - rankScore(a));
      return clone(list.map((p) => card(p, f)));
    },
    async getProviderDetail(slug) {
      await delay(150);
      const p = db.providers.find((x) => (x.slug === slug || x.id === slug) && (x.status === 'publicado' || x.id === session?.providerId));
      if (!p) return null;
      return clone({
        provider: p, cityName: cityName(p.cityId),
        services: db.services.filter((s) => s.providerId === p.id && s.active),
        packages: db.packages.filter((k) => k.providerId === p.id && k.active),
        reviews: db.reviews.filter((r) => r.providerId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      });
    },
    async listFeatured(cityId) {
      const list = db.providers.filter((p) => p.status === 'publicado' && (!cityId || p.cityId === cityId)).sort((a, b) => rankScore(b) - rankScore(a));
      return clone(list.slice(0, 8).map((p) => card(p, {})));
    },
    async stats() {
      const pub = db.providers.filter((p) => p.status === 'publicado');
      const rated = pub.filter((p) => p.rating != null);
      return { providers: pub.length, reviews: db.reviews.length, avgRating: rated.reduce((a, p) => a + p.rating!, 0) / Math.max(1, rated.length), cities: CITIES.length, bookings: db.bookings.length };
    },

    /* ---------- tutor ---------- */
    async getMe() {
      if (!session?.customerId) return null;
      const c = db.customers.find((x) => x.id === session!.customerId);
      return c ? clone({ customer: c, pets: db.pets.filter((p) => p.ownerId === c.id) }) : null;
    },
    async savePet(input) {
      const me = requireTutor();
      if (!input.name.trim() || input.name.length > 40) throw new AppError('invalido', 'Informe o nome do pet (até 40 letras).');
      if (input.weightKg <= 0 || input.weightKg > 120) throw new AppError('invalido', 'Peso inválido.');
      if (input.id) {
        const p = db.pets.find((x) => x.id === input.id && x.ownerId === me.id);
        if (!p) throw new AppError('proibido', 'Este pet não é seu.');
        Object.assign(p, { ...input, id: p.id, ownerId: me.id });
        changed(); return clone(p);
      }
      const p: Pet = { ...input, id: uid('pet'), ownerId: me.id, avatarSeed: Math.floor(Math.random() * 99) } as Pet;
      db.pets.push(p); changed(); return clone(p);
    },
    async deletePet(id) {
      const me = requireTutor();
      if (db.bookings.some((b) => b.petIds.includes(id) && ACTIVE.includes(b.status))) throw new AppError('conflito', 'Este pet tem agendamentos ativos. Cancele-os antes de remover.');
      db.pets = db.pets.filter((p) => !(p.id === id && p.ownerId === me.id)); changed();
    },
    async listMyBookings() {
      const me = requireTutor();
      return db.bookings.filter((b) => b.customerId === me.id).sort((a, b) => b.start.localeCompare(a.start)).map<TutorBooking>((b) => ({
        ...clone(b), provider: clone(db.providers.find((p) => p.id === b.providerId)!), service: clone(db.services.find((s) => s.id === b.serviceId)!), pets: clone(db.pets.filter((p) => b.petIds.includes(p.id))),
      }));
    },
    async createBooking(input: NewBookingInput) {
      await delay(500);
      const me = requireTutor();
      const p = db.providers.find((x) => x.id === input.providerId && x.status === 'publicado');
      if (!p) throw new AppError('nao_encontrado', 'Prestador indisponível.');
      if (p.id === session?.providerId) throw new AppError('proibido', 'Você não pode contratar o próprio serviço.');
      const s = db.services.find((x) => x.id === input.serviceId && x.providerId === p.id && x.active);
      if (!s) throw new AppError('nao_encontrado', 'Serviço indisponível.');
      const pets = db.pets.filter((x) => input.petIds.includes(x.id) && x.ownerId === me.id);
      if (!pets.length || pets.length !== input.petIds.length) throw new AppError('invalido', 'Escolha pelo menos um pet seu.');
      const bad = pets.find((x) => !s.species.includes(x.species) || !s.sizes.includes(x.size));
      if (bad) throw new AppError('invalido', `${bad.name} não é atendido neste serviço (espécie ou porte).`);
      const start = new Date(input.start);
      if (Number.isNaN(start.getTime()) || start.getTime() < Date.now() + 30 * 60000) throw new AppError('invalido', 'Escolha um horário com pelo menos 30 minutos de antecedência.');
      const end = new Date(start.getTime() + (s.unit === 'diaria' && s.category === 'hospedagem' ? 86400000 : s.durationMin * 60000));
      const cap = CAPACITY[s.category] ?? 1;
      if (capacityUsed(p.id, s.category, start.getTime(), end.getTime()) + pets.length > cap) throw new AppError('conflito', 'Esse horário acabou de ser ocupado. Escolha outro.');
      const phone = toE164(input.contact.phone);
      if (!phone) throw new AppError('invalido', 'Telefone inválido. Use DDD + número, ex.: (54) 99123-4567.');
      if (input.notes.length > 600) throw new AppError('invalido', 'Observações com até 600 caracteres.');
      Object.assign(me, { name: input.contact.name.trim().slice(0, 120) || me.name, phone, email: input.contact.email.trim().toLowerCase() || me.email, waOptIn: input.contact.waOptIn, marketingOptIn: input.contact.marketingOptIn });

      // pacote: comprar junto ou usar saldo
      let purchaseId: ID | undefined;
      if (input.packageId) {
        const k = db.packages.find((x) => x.id === input.packageId && x.providerId === p.id && x.active && x.serviceId === s.id);
        if (!k) throw new AppError('invalido', 'Pacote indisponível para este serviço.');
        const pu = { id: uid('pur'), packageId: k.id, providerId: p.id, customerId: me.id, sessionsTotal: k.sessions, sessionsUsed: 1, priceCents: k.priceCents, purchasedAt: nowISO(), expiresAt: new Date(Date.now() + k.validityDays * 86400000).toISOString(), status: 'ativo' as const };
        db.purchases.push(pu); k.soldCount += 1; purchaseId = pu.id;
      } else if (input.packagePurchaseId) {
        const pu = db.purchases.find((x) => x.id === input.packagePurchaseId && x.customerId === me.id && x.providerId === p.id && x.status === 'ativo');
        const k = pu && db.packages.find((x) => x.id === pu.packageId);
        if (!pu || !k || k.serviceId !== s.id || pu.sessionsUsed >= pu.sessionsTotal) throw new AppError('invalido', 'Saldo do pacote indisponível.');
        pu.sessionsUsed += 1; if (pu.sessionsUsed >= pu.sessionsTotal) pu.status = 'esgotado';
        purchaseId = pu.id;
      }
      const pkgPrice = input.packageId ? db.packages.find((x) => x.id === input.packageId)!.priceCents : 0;
      const b: Booking = {
        id: uid('bkg'), code: `CP-${++db.seq}`, providerId: p.id, customerId: me.id, petIds: pets.map((x) => x.id), serviceId: s.id, packagePurchaseId: purchaseId,
        start: start.toISOString(), end: end.toISOString(), priceCents: input.packageId ? pkgPrice : bookingPriceCents(s, pets.length, 1, !!purchaseId),
        status: 'pendente', channel: 'app', notes: input.notes.trim(), location: input.location, reviewed: false,
        timeline: [{ at: nowISO(), type: 'criado', label: purchaseId ? 'Pedido criado pelo app (usando pacote)' : 'Pedido criado pelo app', by: 'tutor' }], createdAt: nowISO(),
      };
      db.bookings.push(b);
      const conv = conversationFor(p.id, me);
      conv.bookingId = b.id; conv.status = 'aguardando_atendimento';
      conv.slaDueAt = new Date(Date.now() + settingsOf(p.id).firstResponseSlaMin * 60000).toISOString();
      if (!conv.tags.includes('app')) conv.tags = [...conv.tags, 'app'];
      sendTemplate(b, 'pedido_recebido');
      pushMessage(conv, 'sistema', `Novo pedido ${b.code}: ${s.name} — ${fmtDay(start)} ${fmtHour(start)}`);
      if (input.notes.trim()) pushMessage(conv, 'cliente', input.notes.trim());
      if (settingsOf(p.id).instantBooking) { b.status = 'confirmado'; event(b, 'confirmado', 'Confirmação automática (agenda instantânea)', 'sistema'); conv.status = 'agendado'; }
      changed();
      return clone(b);
    },
    async cancelMyBooking(id, reason) {
      const me = requireTutor();
      const b = db.bookings.find((x) => x.id === id && x.customerId === me.id);
      if (!b) throw new AppError('nao_encontrado', 'Agendamento não encontrado.');
      transition(b, 'cancelado', 'tutor', reason || 'cancelado pelo tutor'); changed(); return clone(b);
    },
    async replyConfirmation(bookingId, reply) {
      const me = requireTutor();
      const b = db.bookings.find((x) => x.id === bookingId && x.customerId === me.id);
      if (!b) throw new AppError('nao_encontrado', 'Agendamento não encontrado.');
      tutorReply(b.id, reply); changed(); return clone(b);
    },
    async submitReview(bookingId, r) {
      const me = requireTutor();
      const b = db.bookings.find((x) => x.id === bookingId && x.customerId === me.id);
      if (!b || b.status !== 'concluido') throw new AppError('proibido', 'Só é possível avaliar atendimentos concluídos.');
      if (b.reviewed || db.reviews.some((x) => x.bookingId === b.id)) throw new AppError('conflito', 'Você já avaliou este atendimento.');
      if (Date.now() - Date.parse(b.end) > 14 * 86400000) throw new AppError('proibido', 'O prazo de 14 dias para avaliar terminou.');
      if (r.text.trim().length < 10) throw new AppError('invalido', 'Conte um pouco mais (mínimo de 10 caracteres).');
      const pet = db.pets.find((x) => x.id === b.petIds[0]);
      const rev: Review = { id: uid('rev'), providerId: b.providerId, bookingId: b.id, authorName: `${me.name.split(' ')[0]} ${me.name.split(' ').slice(-1)[0][0]}.`, petName: pet?.name ?? 'Pet', petSpecies: pet?.species ?? 'cao',
        serviceName: db.services.find((s) => s.id === b.serviceId)?.name ?? '', rating: r.rating, aspects: r.aspects, text: r.text.trim().slice(0, 1200), createdAt: nowISO(), verifiedBooking: true };
      db.reviews.push(rev); b.reviewed = true; event(b, 'avaliacao', `Avaliado com ${r.rating}★`, 'tutor');
      const p = db.providers.find((x) => x.id === b.providerId)!;
      const rs = db.reviews.filter((x) => x.providerId === p.id);
      p.reviewCount = rs.length; p.rating = Math.round((rs.reduce((a, x) => a + x.rating, 0) / rs.length) * 100) / 100;
      p.ratingBreakdown = [1, 2, 3, 4, 5].map((s) => rs.filter((x) => x.rating === s).length) as Provider['ratingBreakdown'];
      changed(); return clone(rev);
    },
    async listFavorites() { const me = requireTutor(); return clone(db.favorites[me.id] ?? []); },
    async toggleFavorite(pid) {
      const me = requireTutor();
      const cur = new Set(db.favorites[me.id] ?? []);
      if (cur.has(pid)) cur.delete(pid); else cur.add(pid);
      db.favorites[me.id] = [...cur]; changed(); return [...cur];
    },
    async listMyPackages() {
      const me = requireTutor();
      return clone(db.purchases.filter((x) => x.customerId === me.id).map((x) => ({ ...x, pkg: db.packages.find((k) => k.id === x.packageId)!, provider: db.providers.find((p) => p.id === x.providerId)! })));
    },
    async availableSlots(providerId, serviceId, dayISO) {
      await delay(100);
      const p = db.providers.find((x) => x.id === providerId); const s = db.services.find((x) => x.id === serviceId);
      if (!p || !s) return [];
      const day = new Date(dayISO); day.setHours(0, 0, 0, 0);
      const cap = CAPACITY[s.category] ?? 1;
      return daySlots(p, s, day).map((d) => {
        const a = d.getTime(); const z = a + (s.unit === 'diaria' && s.category === 'hospedagem' ? 86400000 : s.durationMin * 60000);
        return { start: d.toISOString(), free: a > Date.now() + 30 * 60000 && capacityUsed(p.id, s.category, a, z) < cap };
      });
    },

    /* ---------- prestador ---------- */
    async getMyProvider() { return session?.providerId ? clone(db.providers.find((p) => p.id === session!.providerId) ?? null) : null; },
    async updateMyProvider(patch) {
      const p = requireProvider();
      if (patch.name !== undefined && (patch.name.trim().length < 2 || patch.name.length > 80)) throw new AppError('invalido', 'Nome com 2 a 80 caracteres.');
      if (patch.bio !== undefined && patch.bio.length > 1200) throw new AppError('invalido', 'Apresentação com até 1.200 caracteres.');
      const allowed: (keyof typeof patch)[] = ['name', 'tagline', 'bio', 'neighborhood', 'amenities', 'openingHours', 'whatsappOptIn', 'cancellationPolicy', 'species', 'sizes'];
      for (const k of allowed) if (patch[k] !== undefined) (p as unknown as Record<string, unknown>)[k] = patch[k];
      if (patch.whatsappOptIn !== undefined) p.whatsappPublic = patch.whatsappOptIn ? settingsOf(p.id).waNumber || p.whatsappPublic : undefined;
      changed(); return clone(p);
    },
    async getDashboard() {
      const p = requireProvider();
      const rows = db.bookings.filter((b) => b.providerId === p.id).map((b) => ({ b, customer: db.customers.find((c) => c.id === b.customerId)!, service: db.services.find((s) => s.id === b.serviceId)! }))
        .sort((a, z) => a.b.start.localeCompare(z.b.start));
      const active = db.purchases.filter((x) => x.providerId === p.id && x.status === 'ativo').length;
      return clone(computeDashboard(p, settingsOf(p.id), rows, db.conversations.filter((c) => c.providerId === p.id), active, db.services.filter((s) => s.providerId === p.id), new Date()));
    },
    async listProviderBookings(range) {
      const p = requireProvider();
      return db.bookings.filter((b) => b.providerId === p.id && (!range || (b.start < range.to && b.end > range.from))).sort((a, b) => a.start.localeCompare(b.start)).map(withProv);
    },
    async updateBookingStatus(id, status, note) {
      const p = requireProvider();
      const b = db.bookings.find((x) => x.id === id && x.providerId === p.id);
      if (!b) throw new AppError('nao_encontrado', 'Agendamento não encontrado.');
      // aceitar um pedido = pedir confirmação ao tutor (ou confirmar direto se o tutor não usa WhatsApp)
      let to = status;
      if (status === 'confirmado' && b.status === 'pendente') {
        const c = db.customers.find((x) => x.id === b.customerId)!;
        if (settingsOf(p.id).autoConfirmationRequest && c.waOptIn) to = 'aguardando_cliente';
      }
      transition(b, to, 'prestador', note); changed(); return clone(b);
    },
    async rescheduleBooking(id, startISO) {
      const p = requireProvider();
      const b = db.bookings.find((x) => x.id === id && x.providerId === p.id);
      if (!b || !ACTIVE.includes(b.status)) throw new AppError('conflito', 'Só agendamentos ativos podem ser remarcados.');
      const s = db.services.find((x) => x.id === b.serviceId)!;
      const start = new Date(startISO); const dur = Date.parse(b.end) - Date.parse(b.start);
      if (start.getTime() < Date.now()) throw new AppError('invalido', 'Escolha um horário futuro.');
      if (capacityUsed(p.id, s.category, start.getTime(), start.getTime() + dur, b.id) + b.petIds.length > (CAPACITY[s.category] ?? 1)) throw new AppError('conflito', 'Sem vaga nesse horário.');
      b.start = start.toISOString(); b.end = new Date(start.getTime() + dur).toISOString();
      event(b, 'mensagem', `Remarcado para ${fmtDay(start)} ${fmtHour(start)}`, 'prestador');
      if (b.status === 'confirmado' || b.status === 'pendente') transition(b, b.status === 'pendente' ? 'aguardando_cliente' : 'cancelado', 'prestador');
      changed(); return clone(b);
    },
    async createManualBooking(input) {
      const p = requireProvider();
      const s = db.services.find((x) => x.id === input.serviceId && x.providerId === p.id);
      const c = db.customers.find((x) => x.id === input.customerId);
      if (!s || !c) throw new AppError('invalido', 'Cliente ou serviço inválido.');
      const start = new Date(input.start);
      const b: Booking = { id: uid('bkg'), code: `CP-${++db.seq}`, providerId: p.id, customerId: c.id, petIds: input.petIds, serviceId: s.id, start: start.toISOString(),
        end: new Date(start.getTime() + (s.unit === 'diaria' && s.category === 'hospedagem' ? 86400000 : s.durationMin * 60000)).toISOString(), priceCents: bookingPriceCents(s, input.petIds.length),
        status: 'pendente', channel: input.channel, notes: input.notes, location: 'local_prestador', reviewed: false, timeline: [{ at: nowISO(), type: 'criado', label: `Lançado pelo prestador (${input.channel})`, by: 'prestador' }], createdAt: nowISO() };
      db.bookings.push(b); transition(b, c.waOptIn ? 'aguardando_cliente' : 'confirmado', 'prestador'); changed(); return clone(b);
    },

    async listConversations() {
      const p = requireProvider();
      return clone(db.conversations.filter((c) => c.providerId === p.id).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).map((c) => ({ ...c, customer: db.customers.find((x) => x.id === c.customerId)! })));
    },
    async listMessages(cid) {
      const p = requireProvider();
      const c = db.conversations.find((x) => x.id === cid && x.providerId === p.id);
      if (!c) throw new AppError('proibido', 'Conversa de outro prestador.');
      return clone(db.messages.filter((m) => m.conversationId === cid).sort((a, b) => a.at.localeCompare(b.at)));
    },
    async sendMessage(cid, text, template?: WaTemplate) {
      const p = requireProvider();
      const c = db.conversations.find((x) => x.id === cid && x.providerId === p.id);
      if (!c) throw new AppError('proibido', 'Conversa de outro prestador.');
      const body = text.trim();
      if (!body) throw new AppError('invalido', 'Mensagem vazia.');
      if (body.length > 4096) throw new AppError('invalido', 'Mensagem muito longa (máx. 4.096 caracteres).');
      // regra da Meta: fora da janela de 24 h só template aprovado
      const lastIn = db.messages.filter((m) => m.conversationId === cid && m.from === 'cliente').map((m) => Date.parse(m.at)).sort().pop() ?? 0;
      if (!template && Date.now() - lastIn > 24 * 3600000) throw new AppError('conflito', 'Fora da janela de 24 h do WhatsApp: use um modelo aprovado para retomar a conversa.');
      const m = pushMessage(c, template ? 'bot' : 'prestador', body, template ? { template: template.name, buttons: template.buttons.length ? template.buttons : undefined } : {});
      c.unread = 0; c.slaDueAt = undefined;
      if (c.status === 'novo' || c.status === 'aguardando_atendimento') c.status = 'aguardando_cliente';
      changed(); return clone(m);
    },
    async setConversationStatus(cid, status: ConversationStatus) {
      const p = requireProvider();
      const c = db.conversations.find((x) => x.id === cid && x.providerId === p.id);
      if (!c) throw new AppError('proibido', 'Conversa de outro prestador.');
      c.status = status; if (status === 'resolvido') { c.unread = 0; c.slaDueAt = undefined; }
      changed(); return clone(c);
    },
    async tagConversation(cid, tags) {
      const p = requireProvider();
      const c = db.conversations.find((x) => x.id === cid && x.providerId === p.id);
      if (!c) throw new AppError('proibido', 'Conversa de outro prestador.');
      c.tags = [...new Set(tags.map((t) => t.trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 8); changed(); return clone(c);
    },
    async markConversationRead(cid) {
      const c = db.conversations.find((x) => x.id === cid && x.providerId === session?.providerId);
      if (c && c.unread) { c.unread = 0; changed(); }
    },
    async simulateIncoming(cid, text) {
      const c = db.conversations.find((x) => x.id === cid && x.providerId === session?.providerId);
      if (!c) return null;
      const b = c.bookingId ? db.bookings.find((x) => x.id === c.bookingId) : undefined;
      if (!text && b && b.status === 'aguardando_cliente') { tutorReply(b.id, 'SIM'); changed(); return clone(db.messages.filter((m) => m.conversationId === cid).slice(-2)[0]); }
      const canned = ['Perfeito, obrigado! 🙏', 'Pode ser às 9h?', 'Combinado! Até lá.', 'Qual o valor com o táxi dog?', 'Ele está vacinado sim, posso mandar a foto da carteirinha.'];
      const m = pushMessage(c, 'cliente', text ?? canned[Math.floor(Math.random() * canned.length)]);
      c.status = 'aguardando_atendimento';
      c.slaDueAt = new Date(Date.now() + settingsOf(c.providerId).firstResponseSlaMin * 60000).toISOString();
      changed(); return clone(m);
    },

    async listServices() { const p = requireProvider(); return clone(db.services.filter((s) => s.providerId === p.id)); },
    async saveService(input) {
      const p = requireProvider();
      if (input.name.trim().length < 3) throw new AppError('invalido', 'Nome do serviço com pelo menos 3 letras.');
      if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 10000000) throw new AppError('invalido', 'Preço inválido.');
      let saved: Service;
      if (input.id) {
        const s = db.services.find((x) => x.id === input.id && x.providerId === p.id);
        if (!s) throw new AppError('proibido', 'Serviço de outro prestador.');
        Object.assign(s, input, { id: s.id, providerId: p.id }); saved = s;
      } else { saved = { ...input, id: uid('svc'), providerId: p.id } as Service; db.services.push(saved); }
      p.priceFromCents = Math.min(...db.services.filter((s) => s.providerId === p.id && s.active).map((s) => s.priceCents), saved.priceCents);
      for (const c of [...new Set(db.services.filter((s) => s.providerId === p.id).map((s) => s.category))]) if (!p.categories.includes(c)) p.categories.push(c);
      changed(); return clone(saved);
    },
    async deleteService(id) {
      const p = requireProvider();
      if (db.bookings.some((b) => b.serviceId === id && ACTIVE.includes(b.status))) throw new AppError('conflito', 'Há agendamentos ativos com este serviço. Desative-o em vez de excluir.');
      db.services = db.services.filter((s) => !(s.id === id && s.providerId === p.id)); changed();
    },
    async listPackages() { const p = requireProvider(); return clone(db.packages.filter((k) => k.providerId === p.id)); },
    async savePackage(input) {
      const p = requireProvider();
      const s = db.services.find((x) => x.id === input.serviceId && x.providerId === p.id);
      if (!s) throw new AppError('invalido', 'Escolha um serviço seu.');
      if (input.sessions < 2 || input.sessions > 60) throw new AppError('invalido', 'Pacote com 2 a 60 sessões.');
      const full = s.priceCents * input.sessions;
      if (input.priceCents <= 0 || input.priceCents > full) throw new AppError('invalido', 'O preço do pacote deve ser menor ou igual ao avulso.');
      let k: ServicePackage | undefined;
      if (input.id) {
        k = db.packages.find((x) => x.id === input.id && x.providerId === p.id);
        if (!k) throw new AppError('proibido', 'Pacote de outro prestador.');
        Object.assign(k, input, { fullPriceCents: full });
      } else { k = { ...input, id: uid('pkg'), providerId: p.id, soldCount: 0, fullPriceCents: full } as ServicePackage; db.packages.push(k); }
      changed(); return clone(k);
    },
    async deletePackage(id) {
      const p = requireProvider();
      if (db.purchases.some((x) => x.packageId === id && x.status === 'ativo')) throw new AppError('conflito', 'Há clientes com saldo ativo neste pacote. Desative-o para parar de vender.');
      db.packages = db.packages.filter((k) => !(k.id === id && k.providerId === p.id)); changed();
    },
    async listPackageSales() {
      const p = requireProvider();
      return clone(db.purchases.filter((x) => x.providerId === p.id).sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
        .map((x) => ({ ...x, customer: db.customers.find((c) => c.id === x.customerId)!, pkg: db.packages.find((k) => k.id === x.packageId)! })).filter((x) => x.pkg));
    },
    async listCustomers() {
      const p = requireProvider();
      const ids = new Set([...db.bookings.filter((b) => b.providerId === p.id).map((b) => b.customerId), ...db.conversations.filter((c) => c.providerId === p.id).map((c) => c.customerId)]);
      const rows: CustomerRow[] = [...ids].map((id) => {
        const bs = db.bookings.filter((b) => b.providerId === p.id && b.customerId === id);
        const done = bs.filter((b) => b.status === 'concluido');
        return { customer: db.customers.find((c) => c.id === id)!, pets: db.pets.filter((x) => x.ownerId === id), bookings: bs.length,
          totalSpentCents: done.reduce((a, b) => a + b.priceCents, 0) + db.purchases.filter((x) => x.customerId === id && x.providerId === p.id).reduce((a, x) => a + x.priceCents, 0),
          lastVisit: done.map((b) => b.start).sort().pop(), activePackages: db.purchases.filter((x) => x.customerId === id && x.providerId === p.id && x.status === 'ativo') };
      });
      return clone(rows.filter((r) => r.customer).sort((a, b) => b.totalSpentCents - a.totalSpentCents));
    },
    async listProviderReviews() { const p = requireProvider(); return clone(db.reviews.filter((r) => r.providerId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); },
    async replyReview(id, text) {
      const p = requireProvider();
      const r = db.reviews.find((x) => x.id === id && x.providerId === p.id);
      if (!r) throw new AppError('proibido', 'Avaliação de outro prestador.');
      if (text.trim().length < 2 || text.length > 600) throw new AppError('invalido', 'Resposta com 2 a 600 caracteres.');
      r.reply = { text: text.trim(), createdAt: nowISO() }; changed(); return clone(r);
    },
    async listTemplates() { return clone(db.templates); },
    async getSettings() { const p = requireProvider(); return clone(settingsOf(p.id)); },
    async saveSettings(patch) {
      const p = requireProvider(); const s = settingsOf(p.id);
      if (patch.waNumber !== undefined && patch.waNumber && !toE164(patch.waNumber)) throw new AppError('invalido', 'Número de WhatsApp inválido.');
      Object.assign(s, patch, { providerId: p.id });
      if (patch.waNumber) s.waNumber = toE164(patch.waNumber)!;
      changed(); return clone(s);
    },

    async registerProvider(input) {
      await delay(600);
      const phone = toE164(input.phone);
      if (!phone) throw new AppError('invalido', 'WhatsApp inválido. Use DDD + número.');
      if (input.name.trim().length < 2) throw new AppError('invalido', 'Informe o nome do seu negócio.');
      if (!input.categories.length) throw new AppError('invalido', 'Escolha pelo menos um tipo de serviço.');
      const city = CITIES.find((c) => c.id === input.cityId)!;
      const id = uid('prv');
      const slugBase = input.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const p: Provider = { id, slug: `${slugBase}-${id.slice(-4)}`, ownerUserId: `usr-${id}`, name: input.name.trim(), kind: input.kind, tagline: 'Perfil novo — complete sua apresentação', bio: '',
        categories: input.categories, cityId: city.id, neighborhood: input.neighborhood, geo: city.center, avatarSeed: Math.floor(Math.random() * 99), coverSeed: Math.floor(Math.random() * 99),
        rating: null, reviewCount: 0, ratingBreakdown: [0, 0, 0, 0, 0], responseTimeMin: 30, responseRate: 1, verification: { identity: false, background: false, venue: false }, yearsExperience: 0, petsServed: 0,
        species: ['cao', 'gato'], sizes: ['mini', 'pequeno', 'medio', 'grande', 'gigante'], priceFromCents: 0, whatsappOptIn: false, openingHours: [1, 2, 3, 4, 5].map((d) => ({ day: d as 1, open: '08:00', close: '18:00' })),
        amenities: [], cancellationPolicy: 'flexivel', plan: input.plan, featured: false, status: 'em_analise', isDemo: true, createdAt: nowISO() };
      db.providers.push(p);
      db.settings.push({ ...settingsOf(id), waNumber: phone });
      session = { userId: p.ownerUserId, role: 'prestador', name: p.name, providerId: p.id };
      safeSet(SKEY, JSON.stringify(session)); changed();
      return clone(p);
    },

    async resetDemo() { db = generateDemo(new Date()); safeSet(KEY, JSON.stringify(db)); changed(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return repo;
}
