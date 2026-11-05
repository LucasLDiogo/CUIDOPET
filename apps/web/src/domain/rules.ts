/** Regras puras de negócio (sem I/O). Usadas pela UI e pelos adaptadores; espelhadas no banco. */
import type { BookingStatus, Provider, SearchFilters, Service } from './types';

/** Transições permitidas (o banco tem a mesma tabela em app.booking_transitions). */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pendente: ['aguardando_cliente', 'confirmado', 'recusado', 'cancelado'],
  aguardando_cliente: ['confirmado', 'cancelado', 'pendente'],
  confirmado: ['em_atendimento', 'cancelado', 'nao_compareceu'],
  em_atendimento: ['concluido'],
  concluido: [],
  cancelado: [],
  recusado: [],
  nao_compareceu: [],
};
export const canTransition = (from: BookingStatus, to: BookingStatus) => BOOKING_TRANSITIONS[from].includes(to);

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pendente: 'Aguardando prestador',
  aguardando_cliente: 'Aguardando sua confirmação',
  confirmado: 'Confirmado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  recusado: 'Recusado',
  nao_compareceu: 'Não compareceu',
};
/** rótulo do ponto de vista do prestador */
export const STATUS_LABEL_PROVIDER: Record<BookingStatus, string> = {
  ...STATUS_LABEL,
  pendente: 'Novo pedido',
  aguardando_cliente: 'Aguardando cliente',
};

export const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Comissão da plataforma em basis points, arredondamento half-up (mesma regra do backend). */
export const commissionCents = (totalCents: number, bps = 1200) => Math.floor((totalCents * bps + 5000) / 10000);

/** Telefone BR → E.164. Retorna null se inválido. */
export function toE164(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  const n = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (!/^[1-9]{2}9?\d{8}$/.test(n)) return null;
  return `+55${n}`;
}
export function formatPhone(e164: string) {
  const d = e164.replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}
/** máscara para exibição pública/lista (LGPD: minimização) */
export const maskPhone = (e164: string) => formatPhone(e164).replace(/\d{4}-/, '••••-');

/** Ranking transparente: nota bayesiana + resposta + verificação + plano (plano NÃO altera a nota). */
export function rankScore(p: Provider) {
  const prior = 4.5, m = 10;
  const bayes = p.rating == null ? prior - 0.3 : (p.rating * p.reviewCount + prior * m) / (p.reviewCount + m);
  const resp = p.responseRate * 0.4 + Math.max(0, 1 - p.responseTimeMin / 120) * 0.3;
  const ver = (p.verification.identity ? 0.25 : 0) + (p.verification.background ? 0.1 : 0) + (p.verification.venue ? 0.05 : 0);
  return bayes + resp + ver + (p.featured ? 0.08 : 0);
}
export function rankReason(p: Provider, f: SearchFilters): string {
  const parts: string[] = [];
  if (p.rating != null && p.reviewCount >= 10) parts.push(`nota ${p.rating.toFixed(1)} em ${p.reviewCount} avaliações`);
  else if (p.rating == null) parts.push('novo na plataforma');
  if (p.responseTimeMin <= 15) parts.push(`responde em ~${p.responseTimeMin} min`);
  if (p.verification.identity) parts.push('identidade verificada');
  if (f.neighborhood && p.neighborhood === f.neighborhood) parts.push('no seu bairro');
  return parts.slice(0, 3).join(' · ');
}

/** Gera horários de um dia para um serviço, respeitando funcionamento (slots de 30 min). */
export function daySlots(p: Provider, s: Service, day: Date): Date[] {
  const oh = p.openingHours.find((h) => h.day === day.getDay());
  if (!oh) return [];
  const [oH, oM] = oh.open.split(':').map(Number);
  const [cH, cM] = oh.close.split(':').map(Number);
  const out: Date[] = [];
  const step = s.unit === 'diaria' ? 60 : 30;
  const dur = Math.min(s.durationMin, 120);
  for (let t = oH * 60 + oM; t + dur <= cH * 60 + cM; t += step) {
    const d = new Date(day); d.setHours(Math.floor(t / 60), t % 60, 0, 0); out.push(d);
  }
  return s.unit === 'diaria' ? out.slice(0, 4) : out;
}

/** capacidade simultânea por categoria (demo); no banco vem de resources.capacity_units */
export const CAPACITY: Record<string, number> = { hospedagem: 6, creche: 12, passeio: 2, pet_sitter: 1, banho_tosa: 3, petshop: 3, adestramento: 1, vet_domicilio: 1 };

export function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/** Preço calculado igual ao servidor (create_booking): por pet em hospedagem/creche/banho_tosa; com pacote = 0. */
export function bookingPriceCents(s: Pick<Service, 'priceCents' | 'category' | 'unit'>, petCount: number, nights = 1, usingPackage = false) {
  if (usingPackage) return 0;
  const perPet = ['hospedagem', 'creche', 'banho_tosa'].includes(s.category) ? Math.max(1, petCount) : 1;
  return s.priceCents * perPet * (s.unit === 'diaria' && s.category === 'hospedagem' ? Math.max(1, nights) : 1);
}
