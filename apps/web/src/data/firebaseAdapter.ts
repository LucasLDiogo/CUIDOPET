/**
 * Adaptador Firebase do Cuidopê (VITE_DATA_BACKEND=firebase) — Firestore modular + Auth.
 *
 * Versão "caminho feliz": catálogo, perfil/pets do tutor, reservas, favoritos, avaliações, painel e CRM.
 * Diferenças em relação ao Supabase (ver docs/backend-supabase-firebase.md):
 *   - Sem Cloud Functions neste repositório: capacidade/overbooking, compra/consumo de pacote,
 *     recálculo de nota e envio real de WhatsApp precisam de funções de servidor (não incluídas).
 *   - firestore.rules garante dono por request.auth.uid, status/preço/nota imutáveis pelo cliente
 *     (diff().affectedKeys()), transições válidas e preço = preço do serviço × unidades.
 *
 * Coleções: users, customers (id = uid do tutor), pets, providers, services, packages, reviews (id = bookingId),
 * bookings, purchases, conversations/{id}/messages, templates, settings (id = providerId), favorites (id = uid).
 */
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator, getAuth, isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail, signInWithEmailAndPassword,
  signInWithEmailLink, signOut as fbSignOut, type Auth,
} from 'firebase/auth';
import {
  arrayUnion, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query,
  setDoc, Timestamp, updateDoc, where, writeBatch, type DocumentData, type Firestore, type QueryConstraint, type Unsubscribe,
} from 'firebase/firestore';
import type {
  Booking, BookingEvent, BookingStatus, Conversation, Customer, CustomerRow, Message, PackagePurchase, Pet, Provider,
  ProviderCard, ProviderSettings, Review, Service, ServicePackage, Session, WaTemplate,
} from '../domain/types';
import { AppError, type ProviderBooking, type Repository, type TutorBooking } from './repository';
import { canTransition, daySlots, fillTemplate, rankReason, rankScore, toE164 } from '../domain/rules';
import { CATEGORIES, CITIES, cityName } from './demo/catalog';
import { computeDashboard } from './dashboard';

const PER_PET = new Set(['hospedagem', 'creche', 'banho_tosa']);
const EMAIL_KEY = 'cuidope.emailForSignIn';

/** remove campos técnicos (denormalizados para as rules) antes de devolver à UI */
function strip<T>(data: DocumentData, id: string, extras: string[]): T {
  const out: Record<string, unknown> = { ...data, id };
  for (const k of extras) delete out[k];
  return out as T;
}
const BOOKING_EXTRAS = ['customerUid', 'providerOwnerUid', 'startAt', 'endAt', 'updatedAt', 'cancelReason'];
const OWNER_EXTRAS = ['ownerUid', 'updatedAt'];
const LINK_EXTRAS = ['linkedProviderUids', 'updatedAt', 'ownerUid'];

function mapFirebaseError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return new AppError('proibido', 'Você não tem permissão para esta ação.');
  if (code === 'unauthenticated') return new AppError('nao_autenticado', 'Faça login para continuar.');
  if (code === 'not-found') return new AppError('nao_encontrado', 'Registro não encontrado.');
  if (code === 'already-exists' || code === 'aborted') return new AppError('conflito', 'O registro foi alterado ao mesmo tempo. Tente de novo.');
  if (code === 'invalid-argument' || code === 'failed-precondition') return new AppError('invalido', 'Dados inválidos.');
  return new AppError('indisponivel', 'Serviço indisponível no momento.');
}
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { throw mapFirebaseError(e); }
}

export function createFirebaseRepository(): Repository {
  const env = import.meta.env;
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  };
  if (!config.apiKey || !config.projectId || !config.appId) throw new AppError('indisponivel', 'Configure as variáveis VITE_FIREBASE_*.');
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  const auth: Auth = getAuth(app);
  const db: Firestore = getFirestore(app);
  if ((env.VITE_FIREBASE_USE_EMULATOR as string | undefined) === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  const col = (name: string) => collection(db, name);
  const newId = (name: string) => doc(col(name)).id;
  const nowIso = () => new Date().toISOString();

  /* ---------- sessão ---------- */
  const uid = async () => {
    await auth.authStateReady();
    return auth.currentUser?.uid ?? null;
  };
  const requireUid = async () => {
    const u = await uid();
    if (!u) throw new AppError('nao_autenticado', 'Faça login para continuar.');
    return u;
  };
  const userDoc = async (u: string) => (await getDoc(doc(db, 'users', u))).data() as { role: Session['role']; name: string; providerId?: string } | undefined;
  /** primeiro acesso: cria users/{uid} e customers/{uid} (tutor) */
  const ensureProfile = async (u: string, email: string | null) => {
    if (await userDoc(u)) return;
    const name = (email ?? 'Tutor').split('@')[0].slice(0, 120);
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', u), { role: 'tutor', name, createdAt: nowIso() });
    batch.set(doc(db, 'customers', u), {
      name, phone: '', email: email ?? '', cityId: '', neighborhood: '', waOptIn: false, marketingOptIn: false, createdAt: nowIso(), linkedProviderUids: [],
    });
    await batch.commit();
  };
  const requireProviderId = async () => {
    const u = await requireUid();
    const ud = await userDoc(u);
    if (!ud?.providerId) throw new AppError('proibido', 'Esta conta não administra um prestador.');
    return { uid: u, providerId: ud.providerId };
  };

  /* ---------- leitura ---------- */
  const getProvider = async (id: string) => {
    const s = await getDoc(doc(db, 'providers', id)).catch(() => null);
    return s?.exists() ? strip<Provider>(s.data(), s.id, ['updatedAt']) : null;
  };
  const publishedProviders = async (extra: QueryConstraint[] = []) =>
    (await getDocs(query(col('providers'), where('status', '==', 'publicado'), ...extra))).docs.map((d) => strip<Provider>(d.data(), d.id, ['updatedAt']));
  const toCard = (p: Provider, hasPackages: boolean, f: Parameters<Repository['searchProviders']>[0]): ProviderCard =>
    ({ ...p, rankReason: rankReason(p, f), hasPackages, cityName: cityName(p.cityId) });
  const providersWithPackages = async () =>
    new Set((await getDocs(query(col('packages'), where('active', '==', true)))).docs.map((d) => d.data().providerId as string));
  const getBookingDoc = async (id: string) => {
    const s = await getDoc(doc(db, 'bookings', id));
    if (!s.exists()) throw new AppError('nao_encontrado', 'Reserva não encontrada.');
    return { raw: s.data(), booking: strip<Booking>(s.data(), s.id, BOOKING_EXTRAS) };
  };
  const event = (type: BookingEvent['type'], label: string, by: BookingEvent['by']): BookingEvent => ({ at: nowIso(), type, label, by });

  /* ---------- realtime ---------- */
  const listeners = new Set<() => void>();
  let unsubs: Unsubscribe[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const notify = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }), 150);
  };
  const attach = async () => {
    unsubs.forEach((u) => u());
    unsubs = [];
    const u = auth.currentUser?.uid;
    if (!u) return;
    const onErr = (e: unknown) => console.warn('[cuidope] realtime:', e);
    unsubs.push(onSnapshot(query(col('bookings'), where('customerUid', '==', u), limit(200)), notify, onErr));
    const ud = await userDoc(u).catch(() => undefined);
    if (ud?.providerId) {
      unsubs.push(onSnapshot(query(col('bookings'), where('providerOwnerUid', '==', u), orderBy('startAt', 'desc'), limit(300)), notify, onErr));
      unsubs.push(onSnapshot(query(col('conversations'), where('providerOwnerUid', '==', u), limit(200)), notify, onErr));
    }
  };
  onAuthStateChanged(auth, () => { if (listeners.size) void attach(); notify(); });

  const repo: Repository = {
    backend: 'firebase',

    async getSession() {
      // conclui o login por link de e-mail, se a URL atual for um link do Firebase
      if (typeof window !== 'undefined' && isSignInWithEmailLink(auth, window.location.href)) {
        let email: string | null = null;
        try { email = window.localStorage.getItem(EMAIL_KEY); } catch { /* storage bloqueado */ }
        if (email) {
          await guard(() => signInWithEmailLink(auth, email!, window.location.href));
          try { window.localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
      const u = await uid();
      if (!u) return null;
      await guard(() => ensureProfile(u, auth.currentUser?.email ?? null));
      const ud = await userDoc(u);
      return { userId: u, role: ud?.role === 'prestador' && ud.providerId ? 'prestador' : 'tutor', name: ud?.name ?? 'Usuário', customerId: u, providerId: ud?.providerId };
    },
    async signInDemo(role) {
      if ((env.VITE_DEMO_LOGIN as string | undefined) !== 'true') throw new AppError('indisponivel', 'Login de demonstração desativado neste ambiente.');
      const password = env.VITE_DEMO_PASSWORD as string | undefined;
      if (!password) throw new AppError('indisponivel', 'Defina VITE_DEMO_PASSWORD (somente ambientes de demonstração).');
      await guard(() => signInWithEmailAndPassword(auth, role === 'prestador' ? 'carla.demo@cuidope.app' : 'ana.demo@cuidope.app', password));
      const s = await repo.getSession();
      if (!s) throw new AppError('nao_autenticado', 'Sessão não iniciada.');
      return s;
    },
    async signInWithEmail(email) {
      const clean = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new AppError('invalido', 'E-mail inválido.');
      try {
        await sendSignInLinkToEmail(auth, clean, { url: `${window.location.origin}/`, handleCodeInApp: true });
        try { window.localStorage.setItem(EMAIL_KEY, clean); } catch { /* ignore */ }
        return { sent: true, message: `Enviamos um link de acesso para ${clean}. Abra no mesmo aparelho.` };
      } catch {
        return { sent: false, message: 'Não foi possível enviar o link agora.' };
      }
    },
    async signOut() {
      await fbSignOut(auth);
    },

    /* ---------- catálogo (referência estática) ---------- */
    async listCategories() { return CATEGORIES; },
    async listCities() { return CITIES; },
    async searchProviders(f) {
      return guard(async () => {
        const list = await publishedProviders(f.cityId ? [where('cityId', '==', f.cityId)] : []);
        const withPkg = await providersWithPackages();
        const term = (f.q ?? '').trim().toLowerCase();
        const cards = list
          .filter((p) => !f.category || f.category === 'todos' || p.categories.includes(f.category))
          .filter((p) => !f.neighborhood || p.neighborhood === f.neighborhood)
          .filter((p) => !f.species || p.species.includes(f.species))
          .filter((p) => !f.size || p.sizes.includes(f.size))
          .filter((p) => !f.minRating || (p.rating ?? 0) >= f.minRating)
          .filter((p) => !f.maxPriceCents || p.priceFromCents <= f.maxPriceCents)
          .filter((p) => !f.verifiedOnly || p.verification.identity)
          .filter((p) => !f.withPackages || withPkg.has(p.id))
          .filter((p) => !term || `${p.name} ${p.tagline} ${p.neighborhood}`.toLowerCase().includes(term))
          .map((p) => toCard(p, withPkg.has(p.id), f));
        const sort = f.sort ?? 'relevancia';
        return cards.sort((a, b) =>
          sort === 'avaliacao' ? (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount
          : sort === 'preco' ? a.priceFromCents - b.priceFromCents
          : sort === 'resposta' ? a.responseTimeMin - b.responseTimeMin
          : rankScore(b) - rankScore(a));
      });
    },
    async getProviderDetail(slug) {
      return guard(async () => {
        const found = (await getDocs(query(col('providers'), where('status', '==', 'publicado'), where('slug', '==', slug), limit(1)))).docs[0];
        if (!found) return null;
        const provider = strip<Provider>(found.data(), found.id, ['updatedAt']);
        const [svcs, pkgs, revs] = await Promise.all([
          getDocs(query(col('services'), where('providerId', '==', provider.id), where('active', '==', true))),
          getDocs(query(col('packages'), where('providerId', '==', provider.id), where('active', '==', true))),
          getDocs(query(col('reviews'), where('providerId', '==', provider.id), orderBy('createdAt', 'desc'), limit(100))),
        ]);
        return {
          provider, cityName: cityName(provider.cityId),
          services: svcs.docs.map((d) => strip<Service>(d.data(), d.id, OWNER_EXTRAS)).sort((a, b) => a.priceCents - b.priceCents),
          packages: pkgs.docs.map((d) => strip<ServicePackage>(d.data(), d.id, OWNER_EXTRAS)),
          reviews: revs.docs.map((d) => strip<Review>(d.data(), d.id, ['customerUid'])),
        };
      });
    },
    async listFeatured(cityId) {
      return guard(async () => {
        const list = await publishedProviders(cityId ? [where('cityId', '==', cityId)] : []);
        const withPkg = await providersWithPackages();
        const featured = list.filter((p) => p.featured);
        return (featured.length ? featured : list).map((p) => toCard(p, withPkg.has(p.id), { cityId })).sort((a, b) => rankScore(b) - rankScore(a)).slice(0, 8);
      });
    },
    async stats() {
      return guard(async () => {
        const list = await publishedProviders();
        const rated = list.filter((p) => p.rating != null);
        return {
          providers: list.length,
          reviews: list.reduce((a, p) => a + p.reviewCount, 0),
          avgRating: rated.length ? Math.round((rated.reduce((a, p) => a + (p.rating ?? 0), 0) / rated.length) * 100) / 100 : 0,
          cities: new Set(list.map((p) => p.cityId)).size,
          bookings: 0, // reservas não são públicas no Firestore (precisaria de contador mantido por função de servidor)
        };
      });
    },

    /* ---------- tutor ---------- */
    async getMe() {
      const u = await uid();
      if (!u) return null;
      return guard(async () => {
        await ensureProfile(u, auth.currentUser?.email ?? null);
        const c = await getDoc(doc(db, 'customers', u));
        const pets = await getDocs(query(col('pets'), where('ownerId', '==', u)));
        return { customer: strip<Customer>(c.data()!, u, LINK_EXTRAS), pets: pets.docs.map((d) => strip<Pet>(d.data(), d.id, LINK_EXTRAS)) };
      });
    },
    async savePet(p) {
      const u = await requireUid();
      return guard(async () => {
        const { id, ...fields } = p;
        if (id) {
          await updateDoc(doc(db, 'pets', id), { ...fields, updatedAt: nowIso() });
          const s = await getDoc(doc(db, 'pets', id));
          return strip<Pet>(s.data()!, id, LINK_EXTRAS);
        }
        const pid = newId('pets');
        const pet: Pet = { ...fields, id: pid, ownerId: u, avatarSeed: Math.floor(Math.random() * 99) + 1 };
        const { id: _omit, ...data } = pet;
        void _omit;
        await setDoc(doc(db, 'pets', pid), { ...data, linkedProviderUids: [] });
        return pet;
      });
    },
    async deletePet(id) {
      await guard(() => deleteDoc(doc(db, 'pets', id)));
    },
    async listMyBookings() {
      const u = await requireUid();
      return guard(async () => {
        const snap = await getDocs(query(col('bookings'), where('customerUid', '==', u), orderBy('startAt', 'desc'), limit(300)));
        const bookings = snap.docs.map((d) => strip<Booking>(d.data(), d.id, BOOKING_EXTRAS));
        const pets = (await getDocs(query(col('pets'), where('ownerId', '==', u)))).docs.map((d) => strip<Pet>(d.data(), d.id, LINK_EXTRAS));
        const provMap = new Map<string, Provider>();
        const svcMap = new Map<string, Service>();
        await Promise.all([...new Set(bookings.map((b) => b.providerId))].map(async (id) => { const p = await getProvider(id); if (p) provMap.set(id, p); }));
        await Promise.all([...new Set(bookings.map((b) => b.serviceId))].map(async (id) => {
          const s = await getDoc(doc(db, 'services', id)).catch(() => null);
          if (s?.exists()) svcMap.set(id, strip<Service>(s.data(), id, OWNER_EXTRAS));
        }));
        return bookings
          .filter((b) => provMap.has(b.providerId) && svcMap.has(b.serviceId))
          .map<TutorBooking>((b) => ({ ...b, provider: provMap.get(b.providerId)!, service: svcMap.get(b.serviceId)!, pets: pets.filter((p) => b.petIds.includes(p.id)) }));
      });
    },
    async createBooking(input) {
      const u = await requireUid();
      if (input.packageId || input.packagePurchaseId) {
        throw new AppError('indisponivel', 'Pacotes no Firebase exigem uma função de servidor (não incluída nesta versão).');
      }
      const phone = toE164(input.contact.phone);
      if (!phone) throw new AppError('invalido', 'Telefone inválido. Use DDD + número.');
      return guard(async () => {
        const provider = await getProvider(input.providerId);
        if (!provider || provider.status !== 'publicado') throw new AppError('nao_encontrado', 'Prestador não encontrado.');
        const sSnap = await getDoc(doc(db, 'services', input.serviceId));
        const svc = sSnap.exists() ? strip<Service>(sSnap.data(), sSnap.id, OWNER_EXTRAS) : null;
        if (!svc || !svc.active || svc.providerId !== provider.id) throw new AppError('nao_encontrado', 'Serviço indisponível.');
        if (input.petIds.length < 1 || input.petIds.length > 3) throw new AppError('invalido', 'Selecione de 1 a 3 pets.');
        const start = new Date(input.start);
        if (!(start.getTime() > Date.now())) throw new AppError('invalido', 'Escolha um horário futuro.');
        const end = new Date(start.getTime() + svc.durationMin * 60000);
        const units = PER_PET.has(svc.category) ? input.petIds.length : 1;
        const id = newId('bookings');
        const booking: Booking = {
          id, code: `CP-${Math.floor(100000 + Math.random() * 899999)}`, providerId: provider.id, customerId: u, petIds: input.petIds,
          serviceId: svc.id, start: start.toISOString(), end: end.toISOString(), priceCents: svc.priceCents * units, status: 'pendente',
          channel: 'app', notes: input.notes.slice(0, 1000), location: input.location, reviewed: false,
          timeline: [event('criado', 'Pedido criado pelo app', 'tutor')], createdAt: nowIso(),
        };
        const { id: _omit, ...data } = booking;
        void _omit;
        const batch = writeBatch(db);
        batch.set(doc(db, 'bookings', id), { ...data, customerUid: u, providerOwnerUid: provider.ownerUserId, startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end) });
        // tutor concede ao prestador leitura do seu cadastro e dos pets envolvidos
        batch.update(doc(db, 'customers', u), {
          name: input.contact.name.slice(0, 120), phone, email: input.contact.email.trim().toLowerCase(), waOptIn: input.contact.waOptIn,
          marketingOptIn: input.contact.marketingOptIn, linkedProviderUids: arrayUnion(provider.ownerUserId), updatedAt: nowIso(),
        });
        for (const pid of input.petIds) batch.update(doc(db, 'pets', pid), { linkedProviderUids: arrayUnion(provider.ownerUserId) });
        await batch.commit();
        return booking;
      });
    },
    async cancelMyBooking(id, reason) {
      return guard(async () => {
        const { booking } = await getBookingDoc(id);
        if (!canTransition(booking.status, 'cancelado') || booking.status === 'em_atendimento') throw new AppError('conflito', 'Esta reserva não pode mais ser cancelada.');
        const timeline = [...booking.timeline, event('cancelado', `Cancelado pelo tutor${reason ? `: ${reason.slice(0, 200)}` : ''}`, 'tutor')];
        await updateDoc(doc(db, 'bookings', id), { status: 'cancelado', timeline, cancelReason: reason.slice(0, 500), updatedAt: nowIso() });
        return { ...booking, status: 'cancelado', timeline };
      });
    },
    async replyConfirmation(bookingId, reply) {
      return guard(async () => {
        const { booking } = await getBookingDoc(bookingId);
        if (booking.status !== 'aguardando_cliente') throw new AppError('conflito', 'Esta reserva não está aguardando confirmação.');
        const to: BookingStatus = reply === 'SIM' ? 'confirmado' : reply === 'NAO' ? 'cancelado' : 'pendente';
        const waConfirmation = { sentAt: booking.waConfirmation?.sentAt ?? nowIso(), repliedAt: nowIso(), reply };
        const timeline = [...booking.timeline, event(to, reply === 'SIM' ? 'Tutor confirmou pelo app' : reply === 'NAO' ? 'Tutor recusou a confirmação' : 'Tutor pediu para remarcar', 'tutor')];
        await updateDoc(doc(db, 'bookings', bookingId), { status: to, waConfirmation, timeline, updatedAt: nowIso() });
        return { ...booking, status: to, waConfirmation, timeline };
      });
    },
    async submitReview(bookingId, r) {
      const u = await requireUid();
      return guard(async () => {
        const { booking } = await getBookingDoc(bookingId);
        if (booking.status !== 'concluido') throw new AppError('conflito', 'Só é possível avaliar atendimentos concluídos.');
        if (booking.reviewed) throw new AppError('conflito', 'Esta reserva já foi avaliada.');
        if (Date.now() > Date.parse(booking.end) + 14 * 86400000) throw new AppError('conflito', 'O prazo para avaliar (14 dias) terminou.');
        const me = (await getDoc(doc(db, 'customers', u))).data() as Customer | undefined;
        const parts = (me?.name ?? 'Tutor').trim().split(/\s+/);
        const pet = booking.petIds[0] ? (await getDoc(doc(db, 'pets', booking.petIds[0]))).data() as Pet | undefined : undefined;
        const svc = (await getDoc(doc(db, 'services', booking.serviceId))).data() as Service | undefined;
        const review: Review = {
          id: bookingId, providerId: booking.providerId, bookingId, authorName: parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0],
          petName: pet?.name ?? '', petSpecies: pet?.species ?? 'cao', serviceName: svc?.name ?? '', rating: r.rating, aspects: r.aspects,
          text: r.text.trim().slice(0, 2000), createdAt: nowIso(), verifiedBooking: true,
        };
        const { id: _omit, ...data } = review;
        void _omit;
        const batch = writeBatch(db);
        // sem customerUid: a avaliação é pública e a autoria é validada pela reserva (firestore.rules)
        batch.set(doc(db, 'reviews', bookingId), data);
        batch.update(doc(db, 'bookings', bookingId), { reviewed: true });
        await batch.commit();
        return review;
      });
    },
    async listFavorites() {
      const u = await uid();
      if (!u) return [];
      const s = await getDoc(doc(db, 'favorites', u)).catch(() => null);
      return (s?.data()?.providerIds as string[] | undefined) ?? [];
    },
    async toggleFavorite(providerId) {
      const u = await requireUid();
      return guard(async () => {
        const cur = await repo.listFavorites();
        const next = cur.includes(providerId) ? cur.filter((x) => x !== providerId) : [...cur, providerId].slice(-200);
        await setDoc(doc(db, 'favorites', u), { providerIds: next });
        return next;
      });
    },
    async listMyPackages() {
      const u = await requireUid();
      return guard(async () => {
        const snap = await getDocs(query(col('purchases'), where('customerUid', '==', u)));
        const out: (PackagePurchase & { pkg: ServicePackage; provider: Provider })[] = [];
        for (const d of snap.docs) {
          const p = strip<PackagePurchase>(d.data(), d.id, ['customerUid', 'providerOwnerUid']);
          const k = await getDoc(doc(db, 'packages', p.packageId));
          const prov = await getProvider(p.providerId);
          if (k.exists() && prov) out.push({ ...p, pkg: strip<ServicePackage>(k.data(), k.id, OWNER_EXTRAS), provider: prov });
        }
        return out;
      });
    },
    async availableSlots(providerId, serviceId, dayISO) {
      const provider = await getProvider(providerId);
      const s = await getDoc(doc(db, 'services', serviceId)).catch(() => null);
      if (!provider || !s?.exists()) return [];
      const svc = strip<Service>(s.data(), s.id, OWNER_EXTRAS);
      // ocupação real não é pública no Firestore; o prestador confirma/recusa (limitação documentada)
      return daySlots(provider, svc, new Date(dayISO)).map((d) => ({ start: d.toISOString(), free: d.getTime() > Date.now() }));
    },

    /* ---------- prestador ---------- */
    async getMyProvider() {
      const u = await uid();
      if (!u) return null;
      const ud = await userDoc(u);
      return ud?.providerId ? getProvider(ud.providerId) : null;
    },
    async updateMyProvider(patch) {
      const { providerId } = await requireProviderId();
      return guard(async () => {
        const allowed = ['name', 'tagline', 'bio', 'neighborhood', 'amenities', 'openingHours', 'whatsappOptIn', 'cancellationPolicy', 'species', 'sizes'] as const;
        const values: Record<string, unknown> = {};
        for (const k of allowed) if (patch[k] !== undefined) values[k] = patch[k];
        if (patch.whatsappOptIn === false) values.whatsappPublic = null;
        if (patch.whatsappOptIn === true) {
          const st = await getDoc(doc(db, 'settings', providerId));
          values.whatsappPublic = (st.data()?.waNumber as string | undefined) || null;
        }
        await updateDoc(doc(db, 'providers', providerId), { ...values, updatedAt: nowIso() });
        return (await getProvider(providerId))!;
      });
    },
    async getDashboard() {
      const { uid: u, providerId } = await requireProviderId();
      return guard(async () => {
        const [provider, settings, bookings, convs, purchases, services] = await Promise.all([
          getProvider(providerId), repo.getSettings().catch(() => null), repo.listProviderBookings(),
          getDocs(query(col('conversations'), where('providerOwnerUid', '==', u))),
          getDocs(query(col('purchases'), where('providerOwnerUid', '==', u), where('status', '==', 'ativo'))),
          repo.listServices(),
        ]);
        return computeDashboard(provider!, settings, bookings.map((b) => ({ b, customer: b.customer, service: b.service })),
          convs.docs.map((d) => ({ status: d.data().status as Conversation['status'] })), purchases.size, services.filter((s) => s.active), new Date());
      });
    },
    async listProviderBookings(range) {
      const { uid: u } = await requireProviderId();
      return guard(async () => {
        const cons: QueryConstraint[] = [where('providerOwnerUid', '==', u)];
        if (range) cons.push(where('startAt', '>=', Timestamp.fromDate(new Date(range.from))), where('startAt', '<=', Timestamp.fromDate(new Date(range.to))));
        const snap = await getDocs(query(col('bookings'), ...cons, orderBy('startAt'), limit(2000)));
        const bookings = snap.docs.map((d) => strip<Booking>(d.data(), d.id, BOOKING_EXTRAS));
        const [custs, pets, svcs] = await Promise.all([
          getDocs(query(col('customers'), where('linkedProviderUids', 'array-contains', u))),
          getDocs(query(col('pets'), where('linkedProviderUids', 'array-contains', u))),
          getDocs(query(col('services'), where('ownerUid', '==', u))),
        ]);
        const cMap = new Map(custs.docs.map((d) => [d.id, strip<Customer>(d.data(), d.id, LINK_EXTRAS)]));
        const pList = pets.docs.map((d) => strip<Pet>(d.data(), d.id, LINK_EXTRAS));
        const sMap = new Map(svcs.docs.map((d) => [d.id, strip<Service>(d.data(), d.id, OWNER_EXTRAS)]));
        return bookings
          .filter((b) => sMap.has(b.serviceId))
          .map<ProviderBooking>((b) => ({
            ...b,
            customer: cMap.get(b.customerId) ?? { id: b.customerId, name: 'Cliente', phone: '', email: '', cityId: '', neighborhood: '', waOptIn: false, marketingOptIn: false, createdAt: b.createdAt },
            service: sMap.get(b.serviceId)!,
            pets: pList.filter((p) => b.petIds.includes(p.id)),
          }));
      });
    },
    async updateBookingStatus(id, status, note) {
      await requireProviderId();
      return guard(async () => {
        const { booking } = await getBookingDoc(id);
        if (!canTransition(booking.status, status)) throw new AppError('conflito', `Transição não permitida: ${booking.status} → ${status}.`);
        const label = status === 'aguardando_cliente' ? 'Aceito pelo prestador — confirmação enviada no WhatsApp' : `Status: ${status}${note ? ` — ${note.slice(0, 200)}` : ''}`;
        const timeline = [...booking.timeline, event(status, label, 'prestador')];
        const patch: Record<string, unknown> = { status, timeline, updatedAt: nowIso() };
        if (status === 'aguardando_cliente') patch.waConfirmation = { sentAt: nowIso() };
        if (status === 'cancelado' || status === 'recusado') patch.cancelReason = (note ?? '').slice(0, 500);
        await updateDoc(doc(db, 'bookings', id), patch);
        return { ...booking, status, timeline, waConfirmation: (patch.waConfirmation as Booking['waConfirmation']) ?? booking.waConfirmation };
      });
    },
    async rescheduleBooking(id, start) {
      await requireProviderId();
      return guard(async () => {
        const { booking } = await getBookingDoc(id);
        if (!['pendente', 'aguardando_cliente', 'confirmado'].includes(booking.status)) throw new AppError('conflito', 'Só é possível remarcar reservas ainda não iniciadas.');
        const s = new Date(start);
        if (!(s.getTime() > Date.now())) throw new AppError('invalido', 'Escolha um horário futuro.');
        const e = new Date(s.getTime() + (Date.parse(booking.end) - Date.parse(booking.start)));
        const timeline = [...booking.timeline, event('mensagem', `Remarcado para ${s.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, 'prestador')];
        await updateDoc(doc(db, 'bookings', id), { start: s.toISOString(), end: e.toISOString(), startAt: Timestamp.fromDate(s), endAt: Timestamp.fromDate(e), timeline, updatedAt: nowIso() });
        return { ...booking, start: s.toISOString(), end: e.toISOString(), timeline };
      });
    },
    async createManualBooking(input) {
      const { uid: u, providerId } = await requireProviderId();
      return guard(async () => {
        const sSnap = await getDoc(doc(db, 'services', input.serviceId));
        const svc = sSnap.exists() ? strip<Service>(sSnap.data(), sSnap.id, OWNER_EXTRAS) : null;
        if (!svc || svc.providerId !== providerId) throw new AppError('nao_encontrado', 'Serviço não encontrado.');
        const start = new Date(input.start);
        const end = new Date(start.getTime() + svc.durationMin * 60000);
        const units = PER_PET.has(svc.category) ? Math.max(1, input.petIds.length) : 1;
        const id = newId('bookings');
        const booking: Booking = {
          id, code: `CP-${Math.floor(100000 + Math.random() * 899999)}`, providerId, customerId: input.customerId, petIds: input.petIds, serviceId: svc.id,
          start: start.toISOString(), end: end.toISOString(), priceCents: svc.priceCents * units, status: 'confirmado', channel: input.channel,
          notes: input.notes.slice(0, 1000), location: 'local_prestador', reviewed: false,
          timeline: [event('criado', `Agendamento registrado pelo prestador (${input.channel})`, 'prestador')], createdAt: nowIso(),
        };
        const { id: _omit, ...data } = booking;
        void _omit;
        await setDoc(doc(db, 'bookings', id), { ...data, customerUid: input.customerId, providerOwnerUid: u, startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end) });
        return booking;
      });
    },

    async listConversations() {
      const { uid: u } = await requireProviderId();
      return guard(async () => {
        const snap = await getDocs(query(col('conversations'), where('providerOwnerUid', '==', u), orderBy('lastMessageAt', 'desc'), limit(300)));
        const custs = await getDocs(query(col('customers'), where('linkedProviderUids', 'array-contains', u)));
        const cMap = new Map(custs.docs.map((d) => [d.id, strip<Customer>(d.data(), d.id, LINK_EXTRAS)]));
        return snap.docs.map((d) => {
          const c = strip<Conversation>(d.data(), d.id, ['providerOwnerUid', 'updatedAt', 'lastInboundAt']);
          return { ...c, customer: cMap.get(c.customerId) ?? { id: c.customerId, name: 'Contato', phone: c.phone, email: '', cityId: '', neighborhood: '', waOptIn: false, marketingOptIn: false, createdAt: c.lastMessageAt } };
        });
      });
    },
    async listMessages(conversationId) {
      return guard(async () =>
        (await getDocs(query(collection(db, 'conversations', conversationId, 'messages'), orderBy('at'), limit(1000)))).docs.map((d) =>
          strip<Message>(d.data(), d.id, ['providerOwnerUid'])));
    },
    async sendMessage(conversationId, text, template) {
      const { uid: u } = await requireProviderId();
      return guard(async () => {
        const conv = (await getDoc(doc(db, 'conversations', conversationId))).data() as (Conversation & { lastInboundAt?: string }) | undefined;
        if (!conv) throw new AppError('nao_encontrado', 'Conversa não encontrada.');
        if (!template && (!conv.lastInboundAt || Date.now() - Date.parse(conv.lastInboundAt) > 86400000)) {
          throw new AppError('conflito', 'Passaram mais de 24 h desde a última mensagem do cliente: use um template aprovado.');
        }
        const body = template ? fillTemplate(template.body, { prestador: '' }) : text.trim().slice(0, 4096);
        const mid = doc(collection(db, 'conversations', conversationId, 'messages')).id;
        // 'enviando': uma função de servidor (não incluída) faz o envio real pela Cloud API e atualiza o status
        const msg: Message = { id: mid, conversationId, from: 'prestador', text: body, at: nowIso(), delivery: 'enviando', template: template?.name, buttons: template?.buttons };
        const { id: _omit, ...data } = msg;
        void _omit;
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        const batch = writeBatch(db);
        batch.set(doc(db, 'conversations', conversationId, 'messages', mid), { ...clean, providerOwnerUid: u });
        batch.update(doc(db, 'conversations', conversationId), { lastMessageAt: msg.at, lastMessagePreview: body.slice(0, 120), status: 'aguardando_cliente', updatedAt: nowIso() });
        await batch.commit();
        return msg;
      });
    },
    async setConversationStatus(conversationId, status) {
      return guard(async () => {
        await updateDoc(doc(db, 'conversations', conversationId), { status, updatedAt: nowIso() });
        const s = await getDoc(doc(db, 'conversations', conversationId));
        return strip<Conversation>(s.data()!, s.id, ['providerOwnerUid', 'updatedAt', 'lastInboundAt']);
      });
    },
    async tagConversation(conversationId, tags) {
      return guard(async () => {
        const clean = [...new Set(tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
        await updateDoc(doc(db, 'conversations', conversationId), { tags: clean, updatedAt: nowIso() });
        const s = await getDoc(doc(db, 'conversations', conversationId));
        return strip<Conversation>(s.data()!, s.id, ['providerOwnerUid', 'updatedAt', 'lastInboundAt']);
      });
    },
    async markConversationRead(conversationId) {
      await guard(() => updateDoc(doc(db, 'conversations', conversationId), { unread: 0, updatedAt: nowIso() }));
    },
    async simulateIncoming() {
      return null;
    },

    async listServices() {
      const { uid: u } = await requireProviderId();
      return guard(async () => (await getDocs(query(col('services'), where('ownerUid', '==', u)))).docs.map((d) => strip<Service>(d.data(), d.id, OWNER_EXTRAS)));
    },
    async saveService(s) {
      const { uid: u, providerId } = await requireProviderId();
      return guard(async () => {
        const { id, ...fields } = s;
        const sid = id ?? newId('services');
        const data = { ...fields, priceCents: Math.round(fields.priceCents), durationMin: Math.round(fields.durationMin), providerId, ownerUid: u, updatedAt: nowIso() };
        if (id) await updateDoc(doc(db, 'services', id), { ...fields, priceCents: data.priceCents, durationMin: data.durationMin, updatedAt: data.updatedAt });
        else await setDoc(doc(db, 'services', sid), data);
        return { ...fields, id: sid, providerId, priceCents: data.priceCents, durationMin: data.durationMin };
      });
    },
    async deleteService(id) {
      await guard(() => deleteDoc(doc(db, 'services', id)));
    },
    async listPackages() {
      const { uid: u } = await requireProviderId();
      return guard(async () => (await getDocs(query(col('packages'), where('ownerUid', '==', u)))).docs.map((d) => strip<ServicePackage>(d.data(), d.id, OWNER_EXTRAS)));
    },
    async savePackage(p) {
      const { uid: u, providerId } = await requireProviderId();
      return guard(async () => {
        const svc = (await getDoc(doc(db, 'services', p.serviceId))).data() as Service | undefined;
        if (!svc || svc.providerId !== providerId) throw new AppError('invalido', 'O serviço do pacote precisa ser seu.');
        const { id, ...fields } = p;
        const fullPriceCents = svc.priceCents * fields.sessions;
        if (id) {
          await updateDoc(doc(db, 'packages', id), { ...fields, fullPriceCents, updatedAt: nowIso() });
          const s = await getDoc(doc(db, 'packages', id));
          return strip<ServicePackage>(s.data()!, id, OWNER_EXTRAS);
        }
        const pid = newId('packages');
        await setDoc(doc(db, 'packages', pid), { ...fields, providerId, ownerUid: u, fullPriceCents, soldCount: 0 });
        return { ...fields, id: pid, providerId, fullPriceCents, soldCount: 0 };
      });
    },
    async deletePackage(id) {
      await guard(() => deleteDoc(doc(db, 'packages', id)));
    },
    async listPackageSales() {
      const { uid: u } = await requireProviderId();
      return guard(async () => {
        const [snap, custs, pkgs] = await Promise.all([
          getDocs(query(col('purchases'), where('providerOwnerUid', '==', u))),
          getDocs(query(col('customers'), where('linkedProviderUids', 'array-contains', u))),
          getDocs(query(col('packages'), where('ownerUid', '==', u))),
        ]);
        const cMap = new Map(custs.docs.map((d) => [d.id, strip<Customer>(d.data(), d.id, LINK_EXTRAS)]));
        const kMap = new Map(pkgs.docs.map((d) => [d.id, strip<ServicePackage>(d.data(), d.id, OWNER_EXTRAS)]));
        return snap.docs
          .map((d) => strip<PackagePurchase>(d.data(), d.id, ['customerUid', 'providerOwnerUid']))
          .filter((p) => cMap.has(p.customerId) && kMap.has(p.packageId))
          .map((p) => ({ ...p, customer: cMap.get(p.customerId)!, pkg: kMap.get(p.packageId)! }));
      });
    },
    async listCustomers() {
      const { uid: u } = await requireProviderId();
      return guard(async () => {
        const [custs, pets, bookings, purchases] = await Promise.all([
          getDocs(query(col('customers'), where('linkedProviderUids', 'array-contains', u))),
          getDocs(query(col('pets'), where('linkedProviderUids', 'array-contains', u))),
          getDocs(query(col('bookings'), where('providerOwnerUid', '==', u))),
          getDocs(query(col('purchases'), where('providerOwnerUid', '==', u), where('status', '==', 'ativo'))),
        ]);
        const bl = bookings.docs.map((d) => strip<Booking>(d.data(), d.id, BOOKING_EXTRAS));
        const pl = purchases.docs.map((d) => strip<PackagePurchase>(d.data(), d.id, ['customerUid', 'providerOwnerUid']));
        return custs.docs.map<CustomerRow>((d) => {
          const customer = strip<Customer>(d.data(), d.id, LINK_EXTRAS);
          const mine = bl.filter((b) => b.customerId === customer.id && b.status !== 'cancelado' && b.status !== 'recusado');
          const last = mine.filter((b) => Date.parse(b.start) <= Date.now()).map((b) => b.start).sort().at(-1);
          return {
            customer,
            pets: pets.docs.map((p) => strip<Pet>(p.data(), p.id, LINK_EXTRAS)).filter((p) => p.ownerId === customer.id),
            bookings: mine.length,
            totalSpentCents: mine.filter((b) => b.status === 'concluido').reduce((a, b) => a + b.priceCents, 0),
            lastVisit: last,
            activePackages: pl.filter((p) => p.customerId === customer.id),
          };
        }).sort((a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? ''));
      });
    },
    async listProviderReviews() {
      const { providerId } = await requireProviderId();
      return guard(async () =>
        (await getDocs(query(col('reviews'), where('providerId', '==', providerId), orderBy('createdAt', 'desc'), limit(1000)))).docs.map((d) =>
          strip<Review>(d.data(), d.id, ['customerUid'])));
    },
    async replyReview(reviewId, text) {
      await requireProviderId();
      return guard(async () => {
        const reply = { text: text.trim().slice(0, 1000), createdAt: nowIso() };
        if (!reply.text) throw new AppError('invalido', 'Escreva uma resposta.');
        await updateDoc(doc(db, 'reviews', reviewId), { reply });
        const s = await getDoc(doc(db, 'reviews', reviewId));
        return strip<Review>(s.data()!, s.id, ['customerUid']);
      });
    },
    async listTemplates() {
      return guard(async () => (await getDocs(col('templates'))).docs.map((d) => strip<WaTemplate>(d.data(), d.id, [])));
    },
    async getSettings() {
      const { providerId } = await requireProviderId();
      return guard(async () => {
        const s = await getDoc(doc(db, 'settings', providerId));
        if (!s.exists()) throw new AppError('nao_encontrado', 'Configurações não encontradas.');
        return strip<ProviderSettings>({ ...s.data(), providerId }, providerId, [...OWNER_EXTRAS, 'id']);
      });
    },
    async saveSettings(patch) {
      const { providerId } = await requireProviderId();
      return guard(async () => {
        const allowed: (keyof ProviderSettings)[] = ['waNumber', 'waProvider', 'autoConfirmationRequest', 'reminder24h', 'reminder2h', 'postServiceReview',
          'reactivationDays', 'firstResponseSlaMin', 'autoReplyOutsideHours', 'instantBooking'];
        const values: Record<string, unknown> = {};
        for (const k of allowed) if (patch[k] !== undefined) values[k] = patch[k];
        if (typeof values.waNumber === 'string' && values.waNumber) {
          const e = toE164(values.waNumber);
          if (!e) throw new AppError('invalido', 'Número de WhatsApp inválido.');
          values.waNumber = e;
        }
        await updateDoc(doc(db, 'settings', providerId), { ...values, updatedAt: nowIso() });
        return repo.getSettings();
      });
    },

    async registerProvider(input) {
      const u = await requireUid();
      const phone = toE164(input.phone);
      if (!phone) throw new AppError('invalido', 'Telefone inválido. Use DDD + número.');
      return guard(async () => {
        const existing = await userDoc(u);
        if (existing?.providerId) throw new AppError('conflito', 'Você já possui um perfil de prestador.');
        const id = newId('providers');
        const base = input.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70);
        const provider: Provider = {
          id, slug: `${base || 'prestador'}-${id.slice(0, 6).toLowerCase()}`, ownerUserId: u, name: input.name.trim(), kind: input.kind, tagline: '', bio: '',
          categories: input.categories, cityId: input.cityId, neighborhood: input.neighborhood,
          geo: CITIES.find((c) => c.id === input.cityId)?.center ?? { lat: 0, lng: 0 }, avatarSeed: Math.floor(Math.random() * 99), coverSeed: Math.floor(Math.random() * 99),
          rating: null, reviewCount: 0, ratingBreakdown: [0, 0, 0, 0, 0], responseTimeMin: 60, responseRate: 0,
          verification: { identity: false, background: false, venue: false }, yearsExperience: 0, petsServed: 0, species: ['cao', 'gato'],
          sizes: ['mini', 'pequeno', 'medio', 'grande', 'gigante'], priceFromCents: 0, whatsappOptIn: false, openingHours: [], amenities: [],
          cancellationPolicy: 'flexivel', plan: input.plan, featured: false, status: 'em_analise', isDemo: false, createdAt: nowIso(),
        };
        const { id: _omit, ...data } = provider;
        void _omit;
        const settings: Omit<ProviderSettings, 'providerId'> = {
          waNumber: phone, waProvider: 'desconectado', waConnected: false, autoConfirmationRequest: true, reminder24h: true, reminder2h: false,
          postServiceReview: true, reactivationDays: 30, firstResponseSlaMin: 15, autoReplyOutsideHours: false, instantBooking: false,
        };
        const batch = writeBatch(db);
        batch.set(doc(db, 'providers', id), data);
        batch.set(doc(db, 'settings', id), { ...settings, ownerUid: u });
        batch.set(doc(db, 'users', u), { role: 'prestador', name: input.name.trim().slice(0, 120), providerId: id, createdAt: nowIso() });
        await batch.commit();
        return provider;
      });
    },

    subscribe(fn) {
      listeners.add(fn);
      if (listeners.size === 1) void attach();
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) { unsubs.forEach((u) => u()); unsubs = []; }
      };
    },
  };
  return repo;
}
