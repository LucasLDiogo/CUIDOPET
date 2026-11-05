import type {
  Booking, BookingStatus, Category, City, Conversation, ConversationStatus, Customer, CustomerRow,
  DashboardData, ID, Message, NewBookingInput, PackagePurchase, Pet, ProviderCard, ProviderDetail,
  Provider, ProviderSettings, Review, SearchFilters, Service, ServicePackage, Session, WaTemplate,
} from '../domain/types';

/**
 * Contrato único de dados. A UI só conversa com esta interface; o backend é escolhido por
 * VITE_DATA_BACKEND = demo | supabase | firebase. Regras de negócio sensíveis (status, valores,
 * avaliações) são REVALIDADAS no servidor (RLS/funções no Supabase, rules no Firestore).
 */
export type ProviderBooking = Booking & { customer: Customer; service: Service; pets: Pet[] };
export type TutorBooking = Booking & { provider: Provider; service: Service; pets: Pet[] };

export interface Repository {
  readonly backend: 'demo' | 'supabase' | 'firebase';

  /* sessão */
  getSession(): Promise<Session | null>;
  signInDemo(role: Session['role'], who?: ID): Promise<Session>;
  signInWithEmail(email: string): Promise<{ sent: boolean; message: string }>;
  signOut(): Promise<void>;

  /* catálogo público */
  listCategories(): Promise<Category[]>;
  listCities(): Promise<City[]>;
  searchProviders(f: SearchFilters): Promise<ProviderCard[]>;
  getProviderDetail(slug: string): Promise<ProviderDetail | null>;
  listFeatured(cityId?: ID): Promise<ProviderCard[]>;
  stats(): Promise<{ providers: number; reviews: number; avgRating: number; cities: number; bookings: number }>;

  /* tutor */
  getMe(): Promise<{ customer: Customer; pets: Pet[] } | null>;
  savePet(p: Omit<Pet, 'id' | 'ownerId' | 'avatarSeed'> & { id?: ID }): Promise<Pet>;
  deletePet(id: ID): Promise<void>;
  listMyBookings(): Promise<TutorBooking[]>;
  createBooking(input: NewBookingInput): Promise<Booking>;
  cancelMyBooking(id: ID, reason: string): Promise<Booking>;
  /** resposta do tutor ao pedido de confirmação enviado pelo WhatsApp (SIM/NAO/REMARCAR) */
  replyConfirmation(bookingId: ID, reply: 'SIM' | 'NAO' | 'REMARCAR'): Promise<Booking>;
  submitReview(bookingId: ID, r: { rating: Review['rating']; aspects: Review['aspects']; text: string }): Promise<Review>;
  listFavorites(): Promise<ID[]>;
  toggleFavorite(providerId: ID): Promise<ID[]>;
  listMyPackages(): Promise<(PackagePurchase & { pkg: ServicePackage; provider: Provider })[]>;
  availableSlots(providerId: ID, serviceId: ID, dayISO: string): Promise<{ start: string; free: boolean }[]>;

  /* prestador */
  getMyProvider(): Promise<Provider | null>;
  updateMyProvider(patch: Partial<Pick<Provider, 'name' | 'tagline' | 'bio' | 'neighborhood' | 'amenities' | 'openingHours' | 'whatsappOptIn' | 'cancellationPolicy' | 'species' | 'sizes'>>): Promise<Provider>;
  getDashboard(): Promise<DashboardData>;
  listProviderBookings(range?: { from: string; to: string }): Promise<ProviderBooking[]>;
  updateBookingStatus(id: ID, status: BookingStatus, note?: string): Promise<Booking>;
  rescheduleBooking(id: ID, start: string): Promise<Booking>;
  createManualBooking(input: { customerId: ID; serviceId: ID; petIds: ID[]; start: string; notes: string; channel: Booking['channel'] }): Promise<Booking>;

  listConversations(): Promise<(Conversation & { customer: Customer })[]>;
  listMessages(conversationId: ID): Promise<Message[]>;
  sendMessage(conversationId: ID, text: string, template?: WaTemplate): Promise<Message>;
  setConversationStatus(conversationId: ID, status: ConversationStatus): Promise<Conversation>;
  tagConversation(conversationId: ID, tags: string[]): Promise<Conversation>;
  markConversationRead(conversationId: ID): Promise<void>;
  /** somente demo: simula a resposta do cliente no WhatsApp */
  simulateIncoming(conversationId: ID, text?: string): Promise<Message | null>;

  listServices(): Promise<Service[]>;
  saveService(s: Omit<Service, 'id' | 'providerId'> & { id?: ID }): Promise<Service>;
  deleteService(id: ID): Promise<void>;
  listPackages(): Promise<ServicePackage[]>;
  savePackage(p: Omit<ServicePackage, 'id' | 'providerId' | 'soldCount' | 'fullPriceCents'> & { id?: ID }): Promise<ServicePackage>;
  deletePackage(id: ID): Promise<void>;
  listPackageSales(): Promise<(PackagePurchase & { customer: Customer; pkg: ServicePackage })[]>;
  listCustomers(): Promise<CustomerRow[]>;
  listProviderReviews(): Promise<Review[]>;
  replyReview(reviewId: ID, text: string): Promise<Review>;
  listTemplates(): Promise<WaTemplate[]>;
  getSettings(): Promise<ProviderSettings>;
  saveSettings(patch: Partial<ProviderSettings>): Promise<ProviderSettings>;

  /* onboarding de prestador */
  registerProvider(input: { name: string; kind: Provider['kind']; categories: Provider['categories']; cityId: ID; neighborhood: string; phone: string; email: string; plan: Provider['plan'] }): Promise<Provider>;

  /* demo */
  resetDemo?(): Promise<void>;
  /** notifica a UI quando qualquer dado muda (realtime no Supabase/Firestore, evento local na demo) */
  subscribe(fn: () => void): () => void;
}

export type AppErrorCode = 'nao_autenticado' | 'proibido' | 'invalido' | 'conflito' | 'nao_encontrado' | 'indisponivel';

export class AppError extends Error {
  code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
