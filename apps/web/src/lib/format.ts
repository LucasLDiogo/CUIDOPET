export { formatBRL, formatPhone, maskPhone } from '../domain/rules';

export const fmtDate = (iso: string, o: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) => new Date(iso).toLocaleDateString('pt-BR', o);
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (iso: string) => `${fmtDate(iso, { weekday: 'short', day: '2-digit', month: 'short' })} · ${fmtTime(iso)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtWeekday = (iso: string) => cap(new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }));

export function relTime(iso: string) {
  const diff = (Date.now() - Date.parse(iso)) / 60000;
  const abs = Math.abs(diff);
  const fut = diff < 0;
  if (abs < 1) return fut ? 'em instantes' : 'agora';
  if (abs < 60) return fut ? `em ${Math.round(abs)} min` : `há ${Math.round(abs)} min`;
  if (abs < 1440) return fut ? `em ${Math.round(abs / 60)} h` : `há ${Math.round(abs / 60)} h`;
  const d = Math.round(abs / 1440);
  if (d < 30) return fut ? `em ${d} dia${d > 1 ? 's' : ''}` : `há ${d} dia${d > 1 ? 's' : ''}`;
  const m = Math.round(d / 30);
  return fut ? `em ${m} ${m > 1 ? 'meses' : 'mês'}` : `há ${m} ${m > 1 ? 'meses' : 'mês'}`;
}
export const chatTime = (iso: string) => {
  const d = new Date(iso); const today = new Date();
  if (d.toDateString() === today.toDateString()) return fmtTime(iso);
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
export const firstName = (n: string) => n.split(' ')[0];
