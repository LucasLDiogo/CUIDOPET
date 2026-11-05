/**
 * Agregações do painel do prestador, compartilhadas pelos adaptadores Supabase e Firebase.
 * Recebem dados JÁ filtrados pela RLS/rules do backend — nada aqui decide permissão.
 */
import type { Booking, BookingStatus, ConversationStatus, Customer, DashboardData, Provider, ProviderSettings, Service } from '../domain/types';
import { CAPACITY, daySlots } from '../domain/rules';

/* =====================================================================================
 * Painel do prestador (agregações no cliente sobre dados já filtrados pela RLS)
 * ===================================================================================== */
export type DashBooking = { b: Booking; customer: Customer; service: Service };
const ACTIVE: BookingStatus[] = ['pendente', 'aguardando_cliente', 'confirmado', 'em_atendimento'];
const REVENUE: BookingStatus[] = ['confirmado', 'em_atendimento', 'concluido'];

export function computeDashboard(
  provider: Provider, settings: ProviderSettings | null, rows: DashBooking[], convs: { status: ConversationStatus }[],
  activePackages: number, services: Service[], now: Date,
): DashboardData {
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const t = (b: Booking) => Date.parse(b.start);
  const withCtx = (r: DashBooking) => r.b;

  const todayBookings = rows.filter((r) => t(r.b) >= dayStart.getTime() && t(r.b) < dayEnd.getTime() && !['cancelado', 'recusado'].includes(r.b.status)).map(withCtx);
  const upcoming = rows
    .filter((r) => t(r.b) >= dayEnd.getTime() && t(r.b) < now.getTime() + 7 * 86400000 && ['pendente', 'aguardando_cliente', 'confirmado'].includes(r.b.status))
    .map(withCtx).slice(0, 30);
  const inRange = (r: DashBooking, a: Date, z: Date) => t(r.b) >= a.getTime() && t(r.b) < z.getTime();
  const sum = (xs: DashBooking[]) => xs.reduce((acc, r) => acc + r.b.priceCents, 0);
  const monthRows = rows.filter((r) => inRange(r, monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1)));
  const prevRows = rows.filter((r) => inRange(r, prevMonthStart, monthStart));

  const capacity = Math.max(1, provider.categories.reduce((a, c) => a + (CAPACITY[c] ?? 1), 0));
  const todayUnits = todayBookings.filter((b) => ACTIVE.includes(b.status) || b.status === 'concluido').reduce((a, b) => a + Math.max(1, b.petIds.length), 0);

  const weekly: DashboardData['weekly'] = [];
  for (let w = 7; w >= 0; w--) {
    const a = new Date(dayStart.getTime() - (w * 7 + dayStart.getDay()) * 86400000);
    const z = new Date(a.getTime() + 7 * 86400000);
    const xs = rows.filter((r) => inRange(r, a, z) && r.b.status !== 'cancelado' && r.b.status !== 'recusado');
    weekly.push({ label: a.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), revenueCents: sum(xs.filter((r) => REVENUE.includes(r.b.status))), bookings: xs.length });
  }

  const since90 = now.getTime() - 90 * 86400000;
  const top = new Map<string, { name: string; count: number; revenueCents: number }>();
  for (const r of rows) {
    if (t(r.b) < since90 || !REVENUE.includes(r.b.status)) continue;
    const e = top.get(r.service.id) ?? { name: r.service.name, count: 0, revenueCents: 0 };
    e.count++; e.revenueCents += r.b.priceCents; top.set(r.service.id, e);
  }

  const reactivation = settings?.reactivationDays ?? 30;
  const byCustomer = new Map<string, { customer: Customer; last: number; future: boolean }>();
  for (const r of rows) {
    const e = byCustomer.get(r.customer.id) ?? { customer: r.customer, last: 0, future: false };
    if (r.b.status === 'concluido') e.last = Math.max(e.last, t(r.b));
    if (t(r.b) > now.getTime() && ACTIVE.includes(r.b.status)) e.future = true;
    byCustomer.set(r.customer.id, e);
  }
  const inactiveCustomers = [...byCustomer.values()]
    .filter((e) => e.last > 0 && !e.future && (now.getTime() - e.last) / 86400000 >= reactivation)
    .map((e) => ({ customer: e.customer, lastVisit: new Date(e.last).toISOString(), days: Math.floor((now.getTime() - e.last) / 86400000) }))
    .sort((a, b) => b.days - a.days).slice(0, 10);

  // horários livres de hoje/amanhã no serviço mais vendido
  const mainSvc = services.find((s) => s.id === [...top.entries()].sort((a, b) => b[1].count - a[1].count)[0]?.[0]) ?? services[0];
  const freeSlots: DashboardData['freeSlots'] = [];
  if (mainSvc) {
    const cap = CAPACITY[mainSvc.category] ?? 1;
    for (const offset of [0, 1]) {
      const day = new Date(dayStart.getTime() + offset * 86400000);
      for (const s of daySlots(provider, mainSvc, day)) {
        const a = s.getTime(); const z = a + mainSvc.durationMin * 60000;
        if (a <= now.getTime()) continue;
        const used = rows.filter((r) => r.service.category === mainSvc.category && ACTIVE.includes(r.b.status) && t(r.b) < z && Date.parse(r.b.end) > a)
          .reduce((acc, r) => acc + Math.max(1, r.b.petIds.length), 0);
        if (used < cap) freeSlots.push({ start: s.toISOString(), label: `${offset === 0 ? 'Hoje' : 'Amanhã'} ${s.toTimeString().slice(0, 5)}` });
        if (freeSlots.length >= 6) break;
      }
    }
  }

  return {
    todayBookings,
    upcoming,
    pendingCount: rows.filter((r) => r.b.status === 'pendente').length,
    awaitingCustomerCount: rows.filter((r) => r.b.status === 'aguardando_cliente').length,
    waitingAttention: convs.filter((c) => c.status === 'aguardando_atendimento' || c.status === 'novo').length,
    monthRevenueCents: sum(monthRows.filter((r) => REVENUE.includes(r.b.status))),
    prevMonthRevenueCents: sum(prevRows.filter((r) => REVENUE.includes(r.b.status))),
    monthBookings: monthRows.filter((r) => r.b.status !== 'cancelado' && r.b.status !== 'recusado').length,
    occupancy: Math.min(1, todayUnits / capacity),
    weekly,
    topServices: [...top.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    inactiveCustomers,
    freeSlots,
    rating: provider.rating,
    reviewCount: provider.reviewCount,
    responseRate: provider.responseRate,
    activePackages,
  };
}
