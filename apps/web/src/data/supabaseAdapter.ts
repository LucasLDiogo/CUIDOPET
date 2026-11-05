/**
 * Adaptador Supabase do Cuidopê (VITE_DATA_BACKEND=supabase).
 *
 * - Leitura pública via view v_public_providers (sem colunas privadas; WhatsApp só com opt-in).
 * - Operações sensíveis (status, preço, saldo de pacote, avaliação) SEMPRE por RPC SECURITY DEFINER
 *   (create_booking, update_booking_status, reply_confirmation, submit_review, ...). A RLS do banco é a
 *   autoridade final: este arquivo nunca "decide" permissão, só monta as consultas.
 * - Envio de WhatsApp pela edge function `whatsapp-send` (token da Meta só no servidor).
 * - Usa SOMENTE a chave publishable/anon (VITE_SUPABASE_ANON_KEY). Nunca service_role no front.
 */
import { createClient, type PostgrestError, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Booking, BookingEvent, BookingStatus, Category, City, Conversation, ConversationStatus, Customer, CustomerRow,
  ID, Message, NewBookingInput, PackagePurchase, Pet, Provider, ProviderCard, ProviderDetail, ProviderSettings, Review,
  SearchFilters, Service, ServicePackage, Session, WaTemplate,
} from '../domain/types';
import { AppError, type AppErrorCode, type ProviderBooking, type Repository, type TutorBooking } from './repository';
import { CAPACITY, daySlots, rankReason, rankScore, toE164 } from '../domain/rules';
import { computeDashboard } from './dashboard';

/* =====================================================================================
 * Linhas do banco (snake_case)
 * ===================================================================================== */
type Row = Record<string, unknown>;
interface ProviderRow {
  id: string; slug: string; owner_user_id?: string | null; name: string; kind: Provider['kind']; tagline: string; bio: string;
  categories: Provider['categories']; city_id: string; city_name?: string; city_uf?: string; neighborhood: string;
  geo_lat: number | string | null; geo_lng: number | string | null; avatar_seed: number; cover_seed: number;
  rating: number | string | null; review_count: number; rating_breakdown: number[]; response_time_min: number; response_rate: number | string;
  verified_identity: boolean; verified_background: boolean; verified_venue: boolean; years_experience: number; pets_served: number;
  species: Provider['species']; sizes: Provider['sizes']; price_from_cents: number; whatsapp_opt_in: boolean; whatsapp_public: string | null;
  opening_hours: Provider['openingHours']; amenities: string[]; cancellation_policy: Provider['cancellationPolicy']; plan: Provider['plan'];
  featured: boolean; status: Provider['status']; is_demo: boolean; created_at: string; has_packages?: boolean;
}
interface ServiceRow {
  id: string; provider_id: string; category: Service['category']; name: string; description: string; price_cents: number; unit: Service['unit'];
  duration_min: number; species: Service['species']; sizes: Service['sizes']; capacity_units?: number; active: boolean;
}
interface PackageRow {
  id: string; provider_id: string; service_id: string; name: string; description: string; sessions: number; price_cents: number;
  full_price_cents: number; validity_days: number; active: boolean; popular: boolean; sold_count: number;
}
interface ReviewRow {
  id: string; provider_id: string; booking_id: string | null; author_name: string; pet_name: string; pet_species: Review['petSpecies'];
  service_name: string; rating: number; aspect_pontualidade: number; aspect_cuidado: number; aspect_comunicacao: number; text: string;
  created_at: string; verified_booking: boolean; reply_text: string | null; reply_at: string | null;
}
interface CustomerRowDb {
  id: string; name: string; phone: string | null; email: string | null; city_id: string | null; neighborhood: string;
  wa_opt_in: boolean; marketing_opt_in: boolean; created_at: string;
}
interface PetRow {
  id: string; owner_id: string; name: string; species: Pet['species']; breed: string; size: Pet['size']; birth_year: number | null;
  weight_kg: number | string | null; temperament: string; care_notes: string; vaccines_up_to_date: boolean; avatar_seed: number;
}
interface BookingRow {
  id: string; code: string; provider_id: string; customer_id: string; service_id: string; package_purchase_id: string | null;
  start_at: string; end_at: string; price_cents: number; status: BookingStatus; channel: Booking['channel']; notes: string;
  location: Booking['location']; wa_confirmation_sent_at: string | null; wa_confirmation_replied_at: string | null;
  wa_confirmation_reply: string | null; reviewed: boolean; created_at: string;
  booking_pets?: { pet_id: string }[];
  booking_events?: { at: string; type: string; label: string; by_actor: BookingEvent['by'] }[];
  customer?: CustomerRowDb | null;
  service?: ServiceRow | null;
}
interface PurchaseRow {
  id: string; package_id: string; provider_id: string; customer_id: string; sessions_total: number; sessions_used: number;
  price_cents: number; purchased_at: string; expires_at: string; status: PackagePurchase['status'];
  pkg?: PackageRow | null; customer?: CustomerRowDb | null;
}
interface ConversationRow {
  id: string; provider_id: string; customer_id: string; phone: string; status: ConversationStatus; tags: string[]; unread: number;
  last_message_at: string; last_message_preview: string; booking_id: string | null; sla_due_at: string | null; assigned_to: string | null;
  customer?: CustomerRowDb | null;
}
interface MessageRow {
  id: string; conversation_id: string; from_actor: Message['from']; text: string; at: string; delivery: Message['delivery'];
  template: string | null; buttons: string[] | null;
}
interface TemplateRow { id: string; name: string; title: string; category: WaTemplate['category']; body: string; buttons: string[]; approved: boolean }
interface SettingsRow {
  provider_id: string; wa_number: string | null; wa_provider: ProviderSettings['waProvider']; wa_connected: boolean;
  auto_confirmation_request: boolean; reminder_24h: boolean; reminder_2h: boolean; post_service_review: boolean;
  reactivation_days: number; first_response_sla_min: number; auto_reply_outside_hours: boolean; instant_booking: boolean;
}

/* =====================================================================================
 * Mapeamento snake_case → camelCase
 * ===================================================================================== */
const iso = (s: string) => new Date(s).toISOString();
const isoOpt = (s: string | null | undefined) => (s ? iso(s) : undefined);
const num = (v: number | string | null | undefined, d = 0) => (v == null ? d : Number(v));

function toProvider(r: ProviderRow): Provider {
  const b = r.rating_breakdown ?? [0, 0, 0, 0, 0];
  return {
    id: r.id, slug: r.slug, ownerUserId: r.owner_user_id ?? '', name: r.name, kind: r.kind, tagline: r.tagline, bio: r.bio,
    categories: r.categories, cityId: r.city_id, neighborhood: r.neighborhood,
    geo: { lat: num(r.geo_lat), lng: num(r.geo_lng) }, avatarSeed: r.avatar_seed, coverSeed: r.cover_seed,
    rating: r.rating == null ? null : Number(r.rating), reviewCount: r.review_count,
    ratingBreakdown: [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0, b[4] ?? 0],
    responseTimeMin: r.response_time_min, responseRate: num(r.response_rate),
    verification: { identity: r.verified_identity, background: r.verified_background, venue: r.verified_venue },
    yearsExperience: r.years_experience, petsServed: r.pets_served, species: r.species, sizes: r.sizes,
    priceFromCents: r.price_from_cents, whatsappOptIn: r.whatsapp_opt_in, whatsappPublic: r.whatsapp_opt_in ? r.whatsapp_public ?? undefined : undefined,
    openingHours: r.opening_hours ?? [], amenities: r.amenities ?? [], cancellationPolicy: r.cancellation_policy, plan: r.plan,
    featured: r.featured, status: r.status, isDemo: r.is_demo, createdAt: iso(r.created_at),
  };
}
const toService = (r: ServiceRow): Service => ({
  id: r.id, providerId: r.provider_id, category: r.category, name: r.name, description: r.description, priceCents: r.price_cents,
  unit: r.unit, durationMin: r.duration_min, species: r.species, sizes: r.sizes, active: r.active,
});
const toPackage = (r: PackageRow): ServicePackage => ({
  id: r.id, providerId: r.provider_id, serviceId: r.service_id, name: r.name, description: r.description, sessions: r.sessions,
  priceCents: r.price_cents, fullPriceCents: r.full_price_cents, validityDays: r.validity_days, active: r.active, popular: r.popular, soldCount: r.sold_count,
});
const clamp5 = (n: number) => Math.min(5, Math.max(1, Math.round(n))) as Review['rating'];
const toReview = (r: ReviewRow): Review => ({
  id: r.id, providerId: r.provider_id, bookingId: r.booking_id ?? undefined, authorName: r.author_name, petName: r.pet_name,
  petSpecies: r.pet_species, serviceName: r.service_name, rating: clamp5(r.rating),
  aspects: { pontualidade: r.aspect_pontualidade, cuidado: r.aspect_cuidado, comunicacao: r.aspect_comunicacao },
  text: r.text, createdAt: iso(r.created_at), verifiedBooking: r.verified_booking,
  reply: r.reply_text && r.reply_at ? { text: r.reply_text, createdAt: iso(r.reply_at) } : undefined,
});
const toCustomer = (r: CustomerRowDb): Customer => ({
  id: r.id, name: r.name, phone: r.phone ?? '', email: r.email ?? '', cityId: r.city_id ?? '', neighborhood: r.neighborhood,
  waOptIn: r.wa_opt_in, marketingOptIn: r.marketing_opt_in, createdAt: iso(r.created_at),
});
const toPet = (r: PetRow): Pet => ({
  id: r.id, ownerId: r.owner_id, name: r.name, species: r.species, breed: r.breed, size: r.size, birthYear: r.birth_year ?? new Date().getFullYear(),
  weightKg: num(r.weight_kg), temperament: r.temperament, careNotes: r.care_notes, vaccinesUpToDate: r.vaccines_up_to_date, avatarSeed: r.avatar_seed,
});
const EVENT_TYPES = new Set<BookingEvent['type']>(['pendente', 'aguardando_cliente', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'recusado', 'nao_compareceu', 'mensagem', 'lembrete', 'avaliacao', 'criado']);
function toBooking(r: BookingRow): Booking {
  const events = [...(r.booking_events ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  return {
    id: r.id, code: r.code, providerId: r.provider_id, customerId: r.customer_id, petIds: (r.booking_pets ?? []).map((p) => p.pet_id),
    serviceId: r.service_id, packagePurchaseId: r.package_purchase_id ?? undefined, start: iso(r.start_at), end: iso(r.end_at),
    priceCents: r.price_cents, status: r.status, channel: r.channel, notes: r.notes, location: r.location,
    waConfirmation: r.wa_confirmation_sent_at
      ? { sentAt: iso(r.wa_confirmation_sent_at), repliedAt: isoOpt(r.wa_confirmation_replied_at), reply: r.wa_confirmation_reply ?? undefined }
      : undefined,
    reviewed: r.reviewed,
    // 'remarcado' (só existe no banco) aparece como 'mensagem' na linha do tempo
    timeline: events.map((e) => ({ at: iso(e.at), type: EVENT_TYPES.has(e.type as BookingEvent['type']) ? (e.type as BookingEvent['type']) : 'mensagem', label: e.label, by: e.by_actor })),
    createdAt: iso(r.created_at),
  };
}
const toPurchase = (r: PurchaseRow): PackagePurchase => ({
  id: r.id, packageId: r.package_id, providerId: r.provider_id, customerId: r.customer_id, sessionsTotal: r.sessions_total,
  sessionsUsed: r.sessions_used, priceCents: r.price_cents, purchasedAt: iso(r.purchased_at), expiresAt: iso(r.expires_at), status: r.status,
});
const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id, providerId: r.provider_id, customerId: r.customer_id, phone: r.phone, status: r.status, tags: r.tags ?? [], unread: r.unread,
  lastMessageAt: iso(r.last_message_at), lastMessagePreview: r.last_message_preview, bookingId: r.booking_id ?? undefined,
  slaDueAt: isoOpt(r.sla_due_at), assignedTo: r.assigned_to ?? undefined,
});
const toMessage = (r: MessageRow): Message => ({
  id: r.id, conversationId: r.conversation_id, from: r.from_actor, text: r.text, at: iso(r.at), delivery: r.delivery,
  template: r.template ?? undefined, buttons: r.buttons ?? undefined,
});
const toTemplate = (r: TemplateRow): WaTemplate => ({
  id: r.id, name: r.name, title: r.title, category: r.category, body: r.body, buttons: r.buttons ?? [], approved: r.approved,
});
const toSettings = (r: SettingsRow): ProviderSettings => ({
  providerId: r.provider_id, waNumber: r.wa_number ?? '', waProvider: r.wa_provider, waConnected: r.wa_connected,
  autoConfirmationRequest: r.auto_confirmation_request, reminder24h: r.reminder_24h, reminder2h: r.reminder_2h,
  postServiceReview: r.post_service_review, reactivationDays: r.reactivation_days, firstResponseSlaMin: r.first_response_sla_min,
  autoReplyOutsideHours: r.auto_reply_outside_hours, instantBooking: r.instant_booking,
});
const placeholderCustomer = (id: string): Customer => ({ id, name: 'Cliente', phone: '', email: '', cityId: '', neighborhood: '', waOptIn: false, marketingOptIn: false, createdAt: new Date(0).toISOString() });
const placeholderService = (id: string, providerId: string): Service => ({ id, providerId, category: 'passeio', name: 'Serviço', description: '', priceCents: 0, unit: 'servico', durationMin: 60, species: ['cao'], sizes: ['medio'], active: false });
const placeholderProvider = (id: string): Provider => ({
  id, slug: '', ownerUserId: '', name: 'Prestador indisponível', kind: 'autonomo', tagline: '', bio: '', categories: ['passeio'], cityId: '', neighborhood: '',
  geo: { lat: 0, lng: 0 }, avatarSeed: 0, coverSeed: 0, rating: null, reviewCount: 0, ratingBreakdown: [0, 0, 0, 0, 0], responseTimeMin: 0, responseRate: 0,
  verification: { identity: false, background: false, venue: false }, yearsExperience: 0, petsServed: 0, species: ['cao'], sizes: ['medio'], priceFromCents: 0,
  whatsappOptIn: false, openingHours: [], amenities: [], cancellationPolicy: 'flexivel', plan: 'essencial', featured: false, status: 'suspenso', isDemo: false,
  createdAt: new Date(0).toISOString(),
});

/* camelCase → snake_case (somente colunas que o cliente pode escrever; o banco revalida via GRANT de coluna) */
const PROVIDER_PATCH: Record<string, string> = {
  name: 'name', tagline: 'tagline', bio: 'bio', neighborhood: 'neighborhood', amenities: 'amenities', openingHours: 'opening_hours',
  whatsappOptIn: 'whatsapp_opt_in', cancellationPolicy: 'cancellation_policy', species: 'species', sizes: 'sizes',
};
const SETTINGS_PATCH: Record<string, string> = {
  waNumber: 'wa_number', waProvider: 'wa_provider', autoConfirmationRequest: 'auto_confirmation_request', reminder24h: 'reminder_24h',
  reminder2h: 'reminder_2h', postServiceReview: 'post_service_review', reactivationDays: 'reactivation_days',
  firstResponseSlaMin: 'first_response_sla_min', autoReplyOutsideHours: 'auto_reply_outside_hours', instantBooking: 'instant_booking',
};
function pickPatch(patch: object, map: Record<string, string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(patch)) if (k in map && v !== undefined) out[map[k]] = v;
  return out;
}

/* =====================================================================================
 * Erros
 * ===================================================================================== */
function toAppError(e: { code?: string; message?: string } | null | undefined, fallback = 'Não foi possível concluir a operação.'): AppError {
  const code = e?.code ?? '';
  const msg = e?.message || fallback;
  const map: Record<string, AppErrorCode> = {
    CP401: 'nao_autenticado', CP403: 'proibido', CP404: 'nao_encontrado', CP409: 'conflito', CP422: 'invalido',
    '42501': 'proibido', PGRST301: 'nao_autenticado', PGRST302: 'nao_autenticado', PGRST116: 'nao_encontrado',
    '23505': 'conflito', '23503': 'conflito', '23P01': 'conflito', '23514': 'invalido', '22P02': 'invalido', '22023': 'invalido', '23502': 'invalido',
  };
  const appCode = map[code] ?? 'indisponivel';
  const friendly =
    code === '23503' ? 'Este registro está em uso (reservas/pacotes). Desative em vez de excluir.'
    : code === '23514' ? 'Algum campo está fora do formato permitido.'
    : code === '42501' ? 'Você não tem permissão para esta ação.'
    : msg;
  return new AppError(appCode, friendly);
}
/** Sem tipos gerados do banco, o supabase-js infere `any`; o genérico T documenta o formato esperado da linha. */
async function run<T = unknown>(p: PromiseLike<{ data: unknown; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toAppError(error);
  return data as T;
}

/* =====================================================================================
 * Fábrica
 * ===================================================================================== */
export function createSupabaseRepository(): Repository {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) throw new AppError('indisponivel', 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  if (/service_role|sb_secret_/i.test(anonKey) || jwtRole(anonKey) === 'service_role') {
    // trava de segurança: a chave secreta jamais pode ir para o bundle do navegador
    throw new AppError('indisponivel', 'VITE_SUPABASE_ANON_KEY parece ser uma chave secreta (service_role). Use a chave publishable/anon.');
  }
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });

  /* ---------- contexto do usuário (cache invalidado a cada mudança de auth) ---------- */
  type Ctx = { uid: string; customerId?: string; providerId?: string; role: Session['role']; name: string } | null;
  let ctxPromise: Promise<Ctx> | null = null;
  const loadCtx = async (): Promise<Ctx> => {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const [profile, customer, provider] = await Promise.all([
      sb.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle(),
      sb.from('customers').select('id, name').eq('user_id', user.id).maybeSingle(),
      sb.from('providers').select('id, name').eq('owner_user_id', user.id).limit(1).maybeSingle(),
    ]);
    const role: Session['role'] = profile.data?.role === 'prestador' && provider.data ? 'prestador' : 'tutor';
    return {
      uid: user.id, role,
      customerId: (customer.data?.id as string | undefined) ?? undefined,
      providerId: (provider.data?.id as string | undefined) ?? undefined,
      name: (profile.data?.full_name as string | undefined) || (customer.data?.name as string | undefined) || user.email || 'Usuário',
    };
  };
  const ctx = () => (ctxPromise ??= loadCtx().catch((e) => { ctxPromise = null; throw e; }));
  const resetCtx = () => { ctxPromise = null; };
  const requireCtx = async () => {
    const c = await ctx();
    if (!c) throw new AppError('nao_autenticado', 'Faça login para continuar.');
    return c;
  };
  const requireCustomerId = async () => {
    const c = await requireCtx();
    if (!c.customerId) throw new AppError('nao_encontrado', 'Perfil de tutor não encontrado.');
    return c.customerId;
  };
  const requireProviderId = async () => {
    const c = await requireCtx();
    if (!c.providerId) throw new AppError('proibido', 'Esta conta não administra um prestador.');
    return c.providerId;
  };

  /* ---------- realtime / listeners ---------- */
  const listeners = new Set<() => void>();
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const notify = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }), 150);
  };
  sb.auth.onAuthStateChange(() => { resetCtx(); notify(); });
  const openChannel = () => {
    const ch = sb.channel('cuidope-db');
    for (const table of ['bookings', 'conversations', 'messages', 'reviews', 'package_purchases']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => notify());
    }
    ch.subscribe();
    return ch;
  };

  /* ---------- helpers de leitura ---------- */
  const BOOKING_SELECT = '*, booking_pets(pet_id), booking_events(at, type, label, by_actor)';
  const getBooking = async (id: ID) => toBooking(await run<BookingRow>(sb.from('bookings').select(BOOKING_SELECT).eq('id', id).single()));
  const publicProvidersByIds = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, Provider>();
    const rows = await run<ProviderRow[]>(sb.from('v_public_providers').select('*').in('id', [...new Set(ids)]));
    return new Map(rows.map((r) => [r.id, toProvider(r)]));
  };
  const toCard = (r: ProviderRow, f: SearchFilters): ProviderCard => {
    const p = toProvider(r);
    return { ...p, rankReason: rankReason(p, f), hasPackages: !!r.has_packages, cityName: r.city_name ? `${r.city_name}/${r.city_uf}` : r.city_id };
  };
  const rpcBooking = async (fn: string, args: Row) => {
    const row = await run<BookingRow>(sb.rpc(fn, args).single());
    return getBooking(row.id);
  };
  const invokeWhatsApp = async (body: Row): Promise<MessageRow> => {
    const { data, error } = await sb.functions.invoke('whatsapp-send', { body });
    if (error) {
      const ctxResp = (error as { context?: Response }).context;
      let payload: { error?: string; hint?: string } = {};
      try { payload = ctxResp ? await ctxResp.json() : {}; } catch { /* corpo não-JSON */ }
      const status = ctxResp?.status ?? 0;
      const code: AppErrorCode = status === 401 ? 'nao_autenticado' : status === 403 ? 'proibido' : status === 404 ? 'nao_encontrado'
        : status === 409 || status === 429 ? 'conflito' : status === 400 || status === 422 ? 'invalido' : 'indisponivel';
      const human: Record<string, string> = {
        fora_da_janela_24h: 'Passaram mais de 24 h desde a última mensagem do cliente: use um template aprovado.',
        limite_de_envio: 'Muitas mensagens em pouco tempo. Aguarde um minuto.',
        sem_consentimento_whatsapp: 'O cliente não autorizou mensagens no WhatsApp.',
        sem_consentimento_marketing: 'O cliente não autorizou mensagens promocionais.',
        template_nao_aprovado: 'Este template ainda não foi aprovado pela Meta.',
      };
      throw new AppError(code, human[payload.error ?? ''] ?? payload.error ?? 'Falha ao enviar pelo WhatsApp.');
    }
    return (data as { message: MessageRow }).message;
  };

  const repo: Repository = {
    backend: 'supabase',

    /* ---------------- sessão ---------------- */
    async getSession() {
      const c = await ctx();
      return c ? { userId: c.uid, role: c.role, name: c.name, customerId: c.customerId, providerId: c.providerId } : null;
    },
    async signInDemo(role) {
      if ((import.meta.env.VITE_DEMO_LOGIN as string | undefined) !== 'true') {
        throw new AppError('indisponivel', 'Login de demonstração desativado neste ambiente.');
      }
      const password = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;
      if (!password) throw new AppError('indisponivel', 'Defina VITE_DEMO_PASSWORD (somente ambientes de demonstração).');
      const email = role === 'prestador' ? 'carla.demo@cuidope.app' : 'ana.demo@cuidope.app';
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new AppError('nao_autenticado', 'Não foi possível entrar com o usuário de demonstração.');
      resetCtx();
      const s = await repo.getSession();
      if (!s) throw new AppError('nao_autenticado', 'Sessão não iniciada.');
      return s;
    },
    async signInWithEmail(email) {
      const clean = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new AppError('invalido', 'E-mail inválido.');
      const { error } = await sb.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: `${window.location.origin}/`, shouldCreateUser: true } });
      if (error) return { sent: false, message: error.status === 429 ? 'Aguarde um minuto antes de pedir outro link.' : 'Não foi possível enviar o link agora.' };
      return { sent: true, message: `Enviamos um link de acesso para ${clean}. Abra no mesmo aparelho.` };
    },
    async signOut() {
      await sb.auth.signOut();
      resetCtx();
    },

    /* ---------------- catálogo público ---------------- */
    async listCategories() {
      const rows = await run<{ id: Category['id']; label: string; short: string; description: string }[]>(sb.from('categories').select('id, label, short, description').order('sort_order'));
      return rows.map((r) => ({ id: r.id, label: r.label, short: r.short, description: r.description }));
    },
    async listCities() {
      const rows = await run<{ id: string; name: string; uf: string; ibge: number; neighborhoods: string[]; center_lat: number; center_lng: number }[]>(
        sb.from('cities').select('*').order('name'));
      return rows.map<City>((r) => ({ id: r.id, name: r.name, uf: r.uf, ibge: r.ibge, neighborhoods: r.neighborhoods ?? [], center: { lat: Number(r.center_lat), lng: Number(r.center_lng) } }));
    },
    async searchProviders(f) {
      let qb = sb.from('v_public_providers').select('*');
      if (f.category && f.category !== 'todos') qb = qb.contains('categories', [f.category]);
      if (f.cityId) qb = qb.eq('city_id', f.cityId);
      if (f.neighborhood) qb = qb.eq('neighborhood', f.neighborhood);
      if (f.species) qb = qb.contains('species', [f.species]);
      if (f.size) qb = qb.contains('sizes', [f.size]);
      if (f.minRating) qb = qb.gte('rating', f.minRating);
      if (f.maxPriceCents) qb = qb.lte('price_from_cents', f.maxPriceCents);
      if (f.verifiedOnly) qb = qb.eq('verified_identity', true);
      if (f.withPackages) qb = qb.eq('has_packages', true);
      const term = (f.q ?? '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (term) qb = qb.or(`name.ilike.*${term}*,tagline.ilike.*${term}*,neighborhood.ilike.*${term}*`);
      const rows = await run<ProviderRow[]>(qb.limit(300));
      const cards = rows.map((r) => toCard(r, f));
      const sort = f.sort ?? 'relevancia';
      cards.sort((a, b) =>
        sort === 'avaliacao' ? (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount
        : sort === 'preco' ? a.priceFromCents - b.priceFromCents
        : sort === 'resposta' ? a.responseTimeMin - b.responseTimeMin
        : rankScore(b) - rankScore(a));
      return cards;
    },
    async getProviderDetail(slug) {
      const row = await run<ProviderRow | null>(sb.from('v_public_providers').select('*').eq('slug', slug).maybeSingle());
      if (!row) return null;
      const [services, packages, reviews] = await Promise.all([
        run<ServiceRow[]>(sb.from('services').select('*').eq('provider_id', row.id).eq('active', true).order('price_cents')),
        run<PackageRow[]>(sb.from('service_packages').select('*').eq('provider_id', row.id).eq('active', true).order('sessions')),
        run<ReviewRow[]>(sb.from('reviews').select('*').eq('provider_id', row.id).eq('status', 'publicada').order('created_at', { ascending: false }).limit(100)),
      ]);
      const detail: ProviderDetail = {
        provider: toProvider(row), cityName: row.city_name ? `${row.city_name}/${row.city_uf}` : row.city_id,
        services: services.map(toService), packages: packages.map(toPackage), reviews: reviews.map(toReview),
      };
      return detail;
    },
    async listFeatured(cityId) {
      let qb = sb.from('v_public_providers').select('*').eq('featured', true);
      if (cityId) qb = qb.eq('city_id', cityId);
      let rows = await run<ProviderRow[]>(qb.limit(24));
      if (rows.length === 0) {
        let fb = sb.from('v_public_providers').select('*').order('rating', { ascending: false, nullsFirst: false });
        if (cityId) fb = fb.eq('city_id', cityId);
        rows = await run<ProviderRow[]>(fb.limit(12));
      }
      return rows.map((r) => toCard(r, { cityId })).sort((a, b) => rankScore(b) - rankScore(a)).slice(0, 8);
    },
    async stats() {
      const s = await run<{ providers: number; reviews: number; avgRating: number; cities: number; bookings: number }>(sb.rpc('public_stats'));
      return { providers: Number(s.providers), reviews: Number(s.reviews), avgRating: Number(s.avgRating), cities: Number(s.cities), bookings: Number(s.bookings) };
    },

    /* ---------------- tutor ---------------- */
    async getMe() {
      const c = await ctx();
      if (!c) return null;
      const cust = await run<CustomerRowDb | null>(sb.from('customers').select('*').eq('user_id', c.uid).maybeSingle());
      if (!cust) return null;
      const pets = await run<PetRow[]>(sb.from('pets').select('*').eq('owner_id', cust.id).order('name'));
      return { customer: toCustomer(cust), pets: pets.map(toPet) };
    },
    async savePet(p) {
      const payload: Row = {
        name: p.name.trim(), species: p.species, breed: p.breed, size: p.size, birth_year: p.birthYear, weight_kg: p.weightKg,
        temperament: p.temperament, care_notes: p.careNotes, vaccines_up_to_date: p.vaccinesUpToDate,
      };
      if (p.id) return toPet(await run<PetRow>(sb.from('pets').update(payload).eq('id', p.id).select('*').single()));
      const ownerId = await requireCustomerId();
      return toPet(await run<PetRow>(sb.from('pets').insert({ ...payload, owner_id: ownerId, avatar_seed: Math.floor(Math.random() * 99) + 1 }).select('*').single()));
    },
    async deletePet(id) {
      await run(sb.from('pets').delete().eq('id', id));
    },
    async listMyBookings() {
      const customerId = await requireCustomerId();
      const rows = await run<BookingRow[]>(sb.from('bookings').select(BOOKING_SELECT).eq('customer_id', customerId).order('start_at', { ascending: false }).limit(500));
      const bookings = rows.map(toBooking);
      const [providers, services, pets] = await Promise.all([
        publicProvidersByIds(bookings.map((b) => b.providerId)),
        bookings.length ? run<ServiceRow[]>(sb.from('services').select('*').in('id', [...new Set(bookings.map((b) => b.serviceId))])) : Promise.resolve([] as ServiceRow[]),
        run<PetRow[]>(sb.from('pets').select('*').eq('owner_id', customerId)),
      ]);
      const svcMap = new Map(services.map((s) => [s.id, toService(s)]));
      const petMap = new Map(pets.map((p) => [p.id, toPet(p)]));
      return bookings.map<TutorBooking>((b) => ({
        ...b,
        provider: providers.get(b.providerId) ?? placeholderProvider(b.providerId),
        service: svcMap.get(b.serviceId) ?? placeholderService(b.serviceId, b.providerId),
        pets: b.petIds.map((id) => petMap.get(id)).filter((x): x is Pet => !!x),
      }));
    },
    async createBooking(input: NewBookingInput) {
      const phone = toE164(input.contact.phone);
      if (!phone) throw new AppError('invalido', 'Telefone inválido. Use DDD + número.');
      return rpcBooking('create_booking', {
        p_provider_id: input.providerId, p_service_id: input.serviceId, p_pet_ids: input.petIds, p_start: new Date(input.start).toISOString(),
        p_notes: input.notes ?? '', p_location: input.location, p_package_id: input.packageId ?? null, p_package_purchase_id: input.packagePurchaseId ?? null,
        p_contact: { name: input.contact.name, phone, email: input.contact.email, waOptIn: input.contact.waOptIn, marketingOptIn: input.contact.marketingOptIn },
      });
    },
    async cancelMyBooking(id, reason) {
      return rpcBooking('cancel_my_booking', { p_booking_id: id, p_reason: reason });
    },
    async replyConfirmation(bookingId, reply) {
      return rpcBooking('reply_confirmation', { p_booking_id: bookingId, p_reply: reply });
    },
    async submitReview(bookingId, r) {
      const row = await run<ReviewRow>(sb.rpc('submit_review', {
        p_booking_id: bookingId, p_rating: r.rating, p_pontualidade: r.aspects.pontualidade, p_cuidado: r.aspects.cuidado,
        p_comunicacao: r.aspects.comunicacao, p_text: r.text,
      }).single());
      return toReview(row);
    },
    async listFavorites() {
      const c = await ctx();
      if (!c?.customerId) return [];
      const rows = await run<{ provider_id: string }[]>(sb.from('favorites').select('provider_id').eq('customer_id', c.customerId));
      return rows.map((r) => r.provider_id);
    },
    async toggleFavorite(providerId) {
      const customerId = await requireCustomerId();
      const exists = await run<{ provider_id: string } | null>(sb.from('favorites').select('provider_id').eq('customer_id', customerId).eq('provider_id', providerId).maybeSingle());
      if (exists) await run(sb.from('favorites').delete().eq('customer_id', customerId).eq('provider_id', providerId));
      else await run(sb.from('favorites').insert({ customer_id: customerId, provider_id: providerId }));
      return repo.listFavorites();
    },
    async listMyPackages() {
      const customerId = await requireCustomerId();
      const rows = await run<PurchaseRow[]>(sb.from('package_purchases').select('*, pkg:service_packages(*)').eq('customer_id', customerId).order('purchased_at', { ascending: false }));
      const providers = await publicProvidersByIds(rows.map((r) => r.provider_id));
      return rows.filter((r) => r.pkg).map((r) => ({ ...toPurchase(r), pkg: toPackage(r.pkg!), provider: providers.get(r.provider_id) ?? placeholderProvider(r.provider_id) }));
    },
    async availableSlots(providerId, serviceId, dayISO) {
      const [pRow, sRow] = await Promise.all([
        run<ProviderRow | null>(sb.from('v_public_providers').select('*').eq('id', providerId).maybeSingle()),
        run<ServiceRow | null>(sb.from('services').select('*').eq('id', serviceId).maybeSingle()),
      ]);
      if (!pRow || !sRow) return [];
      const provider = toProvider(pRow);
      const service = toService(sRow);
      const slots = daySlots(provider, service, new Date(dayISO));
      if (slots.length === 0) return [];
      const now = Date.now();
      const durMs = service.durationMin * 60000;
      const capacity = sRow.capacity_units ?? CAPACITY[service.category] ?? 1;
      let busy: { start_at: string; end_at: string; units: number }[] = [];
      if (await ctx()) {
        const from = new Date(slots[0].getTime()).toISOString();
        const to = new Date(slots[slots.length - 1].getTime() + durMs).toISOString();
        busy = await run<{ start_at: string; end_at: string; units: number }[]>(sb.rpc('busy_slots', { p_provider_id: providerId, p_service_id: serviceId, p_from: from, p_to: to }));
      }
      return slots.map((s) => {
        const start = s.getTime();
        const end = start + durMs;
        const used = busy.reduce((acc, b) => (Date.parse(b.start_at) < end && Date.parse(b.end_at) > start ? acc + Number(b.units) : acc), 0);
        return { start: s.toISOString(), free: start > now && used + 1 <= capacity };
      });
    },

    /* ---------------- prestador ---------------- */
    async getMyProvider() {
      const c = await ctx();
      if (!c?.providerId) return null;
      return toProvider(await run<ProviderRow>(sb.from('providers').select('*').eq('id', c.providerId).single()));
    },
    async updateMyProvider(patch) {
      const providerId = await requireProviderId();
      const values = pickPatch(patch, PROVIDER_PATCH);
      if (Object.keys(values).length === 0) return (await repo.getMyProvider())!;
      return toProvider(await run<ProviderRow>(sb.from('providers').update(values).eq('id', providerId).select('*').single()));
    },
    async getDashboard() {
      const providerId = await requireProviderId();
      const now = new Date();
      const from = new Date(now.getTime() - 120 * 86400000).toISOString();
      const to = new Date(now.getTime() + 15 * 86400000).toISOString();
      const [pRow, sRow, bRows, convs, purchases, svcRows] = await Promise.all([
        run<ProviderRow>(sb.from('providers').select('*').eq('id', providerId).single()),
        run<SettingsRow | null>(sb.from('provider_settings').select('*').eq('provider_id', providerId).maybeSingle()),
        run<BookingRow[]>(sb.from('bookings').select(`${BOOKING_SELECT}, customer:customers(*), service:services(*)`).eq('provider_id', providerId).gte('start_at', from).lte('start_at', to).order('start_at').limit(3000)),
        run<{ status: ConversationStatus }[]>(sb.from('conversations').select('status').eq('provider_id', providerId)),
        run<{ id: string }[]>(sb.from('package_purchases').select('id').eq('provider_id', providerId).eq('status', 'ativo')),
        run<ServiceRow[]>(sb.from('services').select('*').eq('provider_id', providerId).eq('active', true)),
      ]);
      const provider = toProvider(pRow);
      const bookings = bRows.map((r) => ({ b: toBooking(r), customer: r.customer ? toCustomer(r.customer) : placeholderCustomer(r.customer_id), service: r.service ? toService(r.service) : placeholderService(r.service_id, providerId) }));
      return computeDashboard(provider, sRow ? toSettings(sRow) : null, bookings, convs, purchases.length, svcRows.map(toService), now);
    },
    async listProviderBookings(range) {
      const providerId = await requireProviderId();
      let qb = sb.from('bookings').select(`${BOOKING_SELECT}, customer:customers(*), service:services(*)`).eq('provider_id', providerId);
      if (range) qb = qb.gte('start_at', new Date(range.from).toISOString()).lte('start_at', new Date(range.to).toISOString());
      const rows = await run<BookingRow[]>(qb.order('start_at').limit(3000));
      const petIds = [...new Set(rows.flatMap((r) => (r.booking_pets ?? []).map((p) => p.pet_id)))];
      const pets = petIds.length ? await run<PetRow[]>(sb.from('pets').select('*').in('id', petIds)) : [];
      const petMap = new Map(pets.map((p) => [p.id, toPet(p)]));
      return rows.map<ProviderBooking>((r) => {
        const b = toBooking(r);
        return {
          ...b,
          customer: r.customer ? toCustomer(r.customer) : placeholderCustomer(r.customer_id),
          service: r.service ? toService(r.service) : placeholderService(r.service_id, providerId),
          pets: b.petIds.map((id) => petMap.get(id)).filter((x): x is Pet => !!x),
        };
      });
    },
    async updateBookingStatus(id, status, note) {
      const booking = await rpcBooking('update_booking_status', { p_booking_id: id, p_status: status, p_note: note ?? null });
      if (status === 'aguardando_cliente') {
        // pedido de confirmação no WhatsApp (template preenchido no servidor). Falha de envio não desfaz o aceite.
        const settings = await repo.getSettings().catch(() => null);
        if (!settings || settings.autoConfirmationRequest) {
          await invokeWhatsApp({ bookingId: id, template: 'confirmacao_agendamento' }).catch((e) => console.warn('[cuidope] confirmação no WhatsApp não enviada:', e));
        }
      }
      return booking;
    },
    async rescheduleBooking(id, start) {
      return rpcBooking('reschedule_booking', { p_booking_id: id, p_start: new Date(start).toISOString() });
    },
    async createManualBooking(input) {
      return rpcBooking('create_manual_booking', {
        p_customer_id: input.customerId, p_service_id: input.serviceId, p_pet_ids: input.petIds, p_start: new Date(input.start).toISOString(),
        p_notes: input.notes, p_channel: input.channel,
      });
    },

    async listConversations() {
      const providerId = await requireProviderId();
      const rows = await run<ConversationRow[]>(sb.from('conversations').select('*, customer:customers(*)').eq('provider_id', providerId).order('last_message_at', { ascending: false }).limit(500));
      return rows.map((r) => ({ ...toConversation(r), customer: r.customer ? toCustomer(r.customer) : placeholderCustomer(r.customer_id) }));
    },
    async listMessages(conversationId) {
      const rows = await run<MessageRow[]>(sb.from('messages').select('id, conversation_id, from_actor, text, at, delivery, template, buttons').eq('conversation_id', conversationId).order('at').limit(1000));
      return rows.map(toMessage);
    },
    async sendMessage(conversationId, text, template) {
      const row = await invokeWhatsApp(template ? { conversationId, template: template.name } : { conversationId, text });
      return toMessage(row);
    },
    async setConversationStatus(conversationId, status) {
      return toConversation(await run<ConversationRow>(sb.from('conversations').update({ status }).eq('id', conversationId).select('*').single()));
    },
    async tagConversation(conversationId, tags) {
      const clean = [...new Set(tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
      return toConversation(await run<ConversationRow>(sb.from('conversations').update({ tags: clean }).eq('id', conversationId).select('*').single()));
    },
    async markConversationRead(conversationId) {
      await run(sb.from('conversations').update({ unread: 0 }).eq('id', conversationId));
    },
    async simulateIncoming() {
      return null; // só existe na demo
    },

    async listServices() {
      const providerId = await requireProviderId();
      return (await run<ServiceRow[]>(sb.from('services').select('*').eq('provider_id', providerId).order('category').order('name'))).map(toService);
    },
    async saveService(s) {
      const payload: Row = {
        category: s.category, name: s.name.trim(), description: s.description, price_cents: Math.round(s.priceCents), unit: s.unit,
        duration_min: Math.round(s.durationMin), species: s.species, sizes: s.sizes, active: s.active,
      };
      if (s.id) return toService(await run<ServiceRow>(sb.from('services').update(payload).eq('id', s.id).select('*').single()));
      const providerId = await requireProviderId();
      return toService(await run<ServiceRow>(sb.from('services').insert({ ...payload, provider_id: providerId }).select('*').single()));
    },
    async deleteService(id) {
      await run(sb.from('services').delete().eq('id', id));
    },
    async listPackages() {
      const providerId = await requireProviderId();
      return (await run<PackageRow[]>(sb.from('service_packages').select('*').eq('provider_id', providerId).order('name'))).map(toPackage);
    },
    async savePackage(p) {
      const payload: Row = {
        service_id: p.serviceId, name: p.name.trim(), description: p.description, sessions: Math.round(p.sessions), price_cents: Math.round(p.priceCents),
        validity_days: Math.round(p.validityDays), active: p.active, popular: p.popular,
      };
      if (p.id) return toPackage(await run<PackageRow>(sb.from('service_packages').update(payload).eq('id', p.id).select('*').single()));
      const providerId = await requireProviderId();
      return toPackage(await run<PackageRow>(sb.from('service_packages').insert({ ...payload, provider_id: providerId }).select('*').single()));
    },
    async deletePackage(id) {
      await run(sb.from('service_packages').delete().eq('id', id));
    },
    async listPackageSales() {
      const providerId = await requireProviderId();
      const rows = await run<PurchaseRow[]>(sb.from('package_purchases').select('*, customer:customers(*), pkg:service_packages(*)').eq('provider_id', providerId).order('purchased_at', { ascending: false }));
      return rows.filter((r) => r.pkg).map((r) => ({ ...toPurchase(r), customer: r.customer ? toCustomer(r.customer) : placeholderCustomer(r.customer_id), pkg: toPackage(r.pkg!) }));
    },
    async listCustomers() {
      const providerId = await requireProviderId();
      const [links, bookings, purchases] = await Promise.all([
        run<{ customer: CustomerRowDb | null }[]>(sb.from('provider_customers').select('customer:customers(*)').eq('provider_id', providerId)),
        run<{ customer_id: string; start_at: string; price_cents: number; status: BookingStatus }[]>(sb.from('bookings').select('customer_id, start_at, price_cents, status').eq('provider_id', providerId).limit(10000)),
        run<PurchaseRow[]>(sb.from('package_purchases').select('*').eq('provider_id', providerId).eq('status', 'ativo')),
      ]);
      const customers = links.map((l) => l.customer).filter((c): c is CustomerRowDb => !!c);
      const ids = customers.map((c) => c.id);
      const pets = ids.length ? await run<PetRow[]>(sb.from('pets').select('*').in('owner_id', ids)) : [];
      const now = Date.now();
      return customers
        .map<CustomerRow>((c) => {
          const mine = bookings.filter((b) => b.customer_id === c.id);
          const done = mine.filter((b) => b.status === 'concluido');
          const past = mine.filter((b) => Date.parse(b.start_at) <= now && !['cancelado', 'recusado'].includes(b.status));
          const last = past.map((b) => b.start_at).sort().at(-1);
          return {
            customer: toCustomer(c),
            pets: pets.filter((p) => p.owner_id === c.id).map(toPet),
            bookings: mine.filter((b) => !['cancelado', 'recusado'].includes(b.status)).length,
            totalSpentCents: done.reduce((a, b) => a + b.price_cents, 0),
            lastVisit: last ? iso(last) : undefined,
            activePackages: purchases.filter((p) => p.customer_id === c.id).map(toPurchase),
          };
        })
        .sort((a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? ''));
    },
    async listProviderReviews() {
      const providerId = await requireProviderId();
      return (await run<ReviewRow[]>(sb.from('reviews').select('*').eq('provider_id', providerId).order('created_at', { ascending: false }).limit(1000))).map(toReview);
    },
    async replyReview(reviewId, text) {
      return toReview(await run<ReviewRow>(sb.rpc('reply_review', { p_review_id: reviewId, p_text: text }).single()));
    },
    async listTemplates() {
      return (await run<TemplateRow[]>(sb.from('wa_templates').select('*').order('category').order('title'))).map(toTemplate);
    },
    async getSettings() {
      const providerId = await requireProviderId();
      return toSettings(await run<SettingsRow>(sb.from('provider_settings').select('*').eq('provider_id', providerId).single()));
    },
    async saveSettings(patch) {
      const providerId = await requireProviderId();
      const values = pickPatch(patch, SETTINGS_PATCH);
      if (typeof values.wa_number === 'string') {
        const e164 = values.wa_number ? toE164(values.wa_number) : null;
        if (values.wa_number && !e164) throw new AppError('invalido', 'Número de WhatsApp inválido.');
        values.wa_number = e164;
      }
      if (Object.keys(values).length === 0) return repo.getSettings();
      return toSettings(await run<SettingsRow>(sb.from('provider_settings').update(values).eq('provider_id', providerId).select('*').single()));
    },

    async registerProvider(input) {
      const phone = toE164(input.phone);
      if (!phone) throw new AppError('invalido', 'Telefone inválido. Use DDD + número.');
      const row = await run<ProviderRow>(sb.rpc('register_provider', {
        p_name: input.name, p_kind: input.kind, p_categories: input.categories, p_city_id: input.cityId, p_neighborhood: input.neighborhood,
        p_phone: phone, p_email: input.email.trim().toLowerCase(), p_plan: input.plan,
      }).single());
      resetCtx();
      notify();
      return toProvider(row);
    },

    subscribe(fn) {
      listeners.add(fn);
      if (!channel) channel = openChannel();
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0 && channel) {
          void sb.removeChannel(channel);
          channel = null;
        }
      };
    },
  };
  return repo;
}

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return (JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}
