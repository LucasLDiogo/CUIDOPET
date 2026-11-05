/**
 * Cuidopê — modelo de domínio compartilhado pelo front-end e pelos adaptadores
 * (demo/localStorage, Supabase e Firestore). Valores monetários SEMPRE em centavos (inteiro).
 * Datas em ISO-8601 (UTC). Telefones em E.164 (+55DDDNÚMERO).
 */

export type ID = string;

export type CategoryId =
  | 'passeio'
  | 'pet_sitter'
  | 'hospedagem'
  | 'creche'
  | 'banho_tosa'
  | 'petshop'
  | 'adestramento'
  | 'vet_domicilio';

export interface Category {
  id: CategoryId;
  label: string;
  short: string;
  description: string;
}

export interface City {
  id: ID; // ex.: 'passo-fundo-rs'
  name: string;
  uf: string;
  ibge: number;
  neighborhoods: string[];
  center: { lat: number; lng: number };
}

export type Species = 'cao' | 'gato';
export type PetSize = 'mini' | 'pequeno' | 'medio' | 'grande' | 'gigante';
export type PlanCode = 'essencial' | 'profissional' | 'pro';

export interface OpeningHour {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo
  open: string; // 'HH:MM'
  close: string;
}

export interface Verification {
  identity: boolean; // documento conferido
  background: boolean; // antecedentes
  venue: boolean; // local vistoriado (pet house / petshop)
}

export interface Provider {
  id: ID;
  slug: string;
  ownerUserId: ID;
  name: string;
  kind: 'autonomo' | 'empresa';
  tagline: string;
  bio: string;
  categories: CategoryId[];
  cityId: ID;
  neighborhood: string;
  /** Coordenadas APROXIMADAS (bairro), nunca o endereço exato. */
  geo: { lat: number; lng: number };
  avatarSeed: number;
  coverSeed: number;
  rating: number | null; // null = sem avaliações (nunca inventar 5★)
  reviewCount: number;
  ratingBreakdown: [number, number, number, number, number]; // qtd de 1★..5★
  responseTimeMin: number;
  responseRate: number; // 0..1
  verification: Verification;
  yearsExperience: number;
  petsServed: number;
  species: Species[];
  sizes: PetSize[];
  priceFromCents: number;
  /** WhatsApp profissional exibido apenas se whatsappOptIn = true. */
  whatsappOptIn: boolean;
  whatsappPublic?: string;
  openingHours: OpeningHour[];
  amenities: string[];
  cancellationPolicy: 'flexivel' | 'moderada' | 'rigida';
  plan: PlanCode;
  featured: boolean;
  status: 'rascunho' | 'em_analise' | 'publicado' | 'suspenso';
  isDemo: boolean;
  createdAt: string;
}

export type PriceUnit = 'passeio' | 'hora' | 'diaria' | 'servico' | 'visita' | 'mes';

export interface Service {
  id: ID;
  providerId: ID;
  category: CategoryId;
  name: string;
  description: string;
  priceCents: number;
  unit: PriceUnit;
  durationMin: number;
  species: Species[];
  sizes: PetSize[];
  active: boolean;
}

export interface ServicePackage {
  id: ID;
  providerId: ID;
  serviceId: ID;
  name: string;
  description: string;
  sessions: number;
  priceCents: number;
  /** preço avulso equivalente (sessions × preço do serviço) */
  fullPriceCents: number;
  validityDays: number;
  active: boolean;
  popular: boolean;
  soldCount: number;
}

export interface Review {
  id: ID;
  providerId: ID;
  bookingId?: ID;
  authorName: string; // nome + inicial do sobrenome
  petName: string;
  petSpecies: Species;
  serviceName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  aspects: { pontualidade: number; cuidado: number; comunicacao: number };
  text: string;
  createdAt: string;
  verifiedBooking: boolean; // só avaliações de agendamento concluído
  reply?: { text: string; createdAt: string };
}

export interface Pet {
  id: ID;
  ownerId: ID;
  name: string;
  species: Species;
  breed: string;
  size: PetSize;
  birthYear: number;
  weightKg: number;
  temperament: string;
  careNotes: string;
  vaccinesUpToDate: boolean;
  avatarSeed: number;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string; // E.164
  email: string;
  cityId: ID;
  neighborhood: string;
  waOptIn: boolean; // consentimento para mensagens transacionais no WhatsApp
  marketingOptIn: boolean; // consentimento separado para ofertas
  createdAt: string;
}

export type BookingStatus =
  | 'pendente' // tutor solicitou; aguardando o prestador aceitar
  | 'aguardando_cliente' // prestador aceitou; confirmação enviada no WhatsApp; aguardando "SIM" do tutor
  | 'confirmado'
  | 'em_atendimento'
  | 'concluido'
  | 'cancelado'
  | 'recusado'
  | 'nao_compareceu';

export type BookingChannel = 'app' | 'whatsapp' | 'balcao';

export interface BookingEvent {
  at: string;
  type: BookingStatus | 'mensagem' | 'lembrete' | 'avaliacao' | 'criado';
  label: string;
  by: 'tutor' | 'prestador' | 'sistema' | 'whatsapp';
}

export interface Booking {
  id: ID;
  code: string; // ex.: CP-24816
  providerId: ID;
  customerId: ID;
  petIds: ID[];
  serviceId: ID;
  packagePurchaseId?: ID;
  start: string;
  end: string;
  priceCents: number;
  status: BookingStatus;
  channel: BookingChannel;
  notes: string;
  location: 'casa_tutor' | 'local_prestador' | 'busca_e_entrega';
  waConfirmation?: { sentAt: string; repliedAt?: string; reply?: string };
  reviewed: boolean;
  timeline: BookingEvent[];
  createdAt: string;
}

export interface PackagePurchase {
  id: ID;
  packageId: ID;
  providerId: ID;
  customerId: ID;
  sessionsTotal: number;
  sessionsUsed: number;
  priceCents: number;
  purchasedAt: string;
  expiresAt: string;
  status: 'ativo' | 'esgotado' | 'expirado';
}

export type ConversationStatus =
  | 'novo'
  | 'aguardando_atendimento' // cliente escreveu, prestador ainda não respondeu (SLA correndo)
  | 'aguardando_cliente' // prestador respondeu/enviou confirmação, aguardando o cliente
  | 'agendado'
  | 'resolvido';

export interface Conversation {
  id: ID;
  providerId: ID;
  customerId: ID;
  phone: string;
  status: ConversationStatus;
  tags: string[];
  unread: number;
  lastMessageAt: string;
  lastMessagePreview: string;
  bookingId?: ID;
  slaDueAt?: string; // prazo de primeira resposta
  assignedTo?: string;
}

export interface Message {
  id: ID;
  conversationId: ID;
  from: 'cliente' | 'prestador' | 'bot' | 'sistema';
  text: string;
  at: string;
  delivery: 'enviando' | 'enviado' | 'entregue' | 'lido' | 'falhou';
  template?: string;
  buttons?: string[];
}

export interface WaTemplate {
  id: ID;
  name: string; // nome técnico aprovado na Meta, ex.: confirmacao_agendamento
  title: string;
  category: 'utility' | 'marketing';
  body: string; // com {{nome}}, {{pet}}, {{servico}}, {{data}}, {{hora}}, {{prestador}}
  buttons: string[];
  approved: boolean;
}

export interface ProviderSettings {
  providerId: ID;
  waNumber: string;
  waProvider: 'cloud_api' | 'z_api' | 'evolution' | 'desconectado';
  waConnected: boolean;
  autoConfirmationRequest: boolean; // envia pedido de confirmação ao aceitar
  reminder24h: boolean;
  reminder2h: boolean;
  postServiceReview: boolean;
  reactivationDays: number; // cliente sem visita há N dias → sugestão de reativação
  firstResponseSlaMin: number;
  autoReplyOutsideHours: boolean;
  instantBooking: boolean; // confirma sem aprovação manual
}

export interface Session {
  userId: ID;
  role: 'tutor' | 'prestador';
  name: string;
  customerId?: ID;
  providerId?: ID;
}

/* ---------- consultas ---------- */

export interface SearchFilters {
  q?: string;
  category?: CategoryId | 'todos';
  cityId?: ID;
  neighborhood?: string;
  species?: Species;
  size?: PetSize;
  minRating?: number;
  maxPriceCents?: number;
  verifiedOnly?: boolean;
  withPackages?: boolean;
  sort?: 'relevancia' | 'avaliacao' | 'preco' | 'resposta';
}

export interface ProviderCard extends Provider {
  /** motivo transparente do ranking (exibido ao usuário) */
  rankReason: string;
  hasPackages: boolean;
  cityName: string;
}

export interface ProviderDetail {
  provider: Provider;
  cityName: string;
  services: Service[];
  packages: ServicePackage[];
  reviews: Review[];
}

export interface DashboardData {
  todayBookings: Booking[];
  upcoming: Booking[];
  pendingCount: number;
  awaitingCustomerCount: number;
  waitingAttention: number; // conversas aguardando atendimento
  monthRevenueCents: number;
  prevMonthRevenueCents: number;
  monthBookings: number;
  occupancy: number; // 0..1
  weekly: { label: string; revenueCents: number; bookings: number }[];
  topServices: { name: string; count: number; revenueCents: number }[];
  inactiveCustomers: { customer: Customer; lastVisit: string; days: number }[];
  freeSlots: { start: string; label: string }[];
  rating: number | null;
  reviewCount: number;
  responseRate: number;
  activePackages: number;
}

export interface CustomerRow {
  customer: Customer;
  pets: Pet[];
  bookings: number;
  totalSpentCents: number;
  lastVisit?: string;
  activePackages: PackagePurchase[];
}

export interface NewBookingInput {
  providerId: ID;
  serviceId: ID;
  packageId?: ID; // comprar pacote junto
  packagePurchaseId?: ID; // usar saldo de pacote
  petIds: ID[];
  start: string;
  notes: string;
  location: Booking['location'];
  contact: { name: string; phone: string; email: string; waOptIn: boolean; marketingOptIn: boolean };
}
