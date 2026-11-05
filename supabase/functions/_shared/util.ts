// Utilitários compartilhados das edge functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

export function env(name: string, required = true): string {
  const v = Deno.env.get(name) ?? '';
  if (required && !v) throw new Error(`variável de ambiente ausente: ${name}`);
  return v;
}

/** Cliente com service_role — SOMENTE no servidor (nunca devolver dados sem filtrar). */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente "como o usuário": repassa o JWT recebido, então a RLS vale normalmente. */
export function userClient(authorization: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/* ---------- criptografia ---------- */
const enc = new TextEncoder();

/** Comparação em tempo constante (não vaza a posição do primeiro byte diferente). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, payload: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Valida X-Hub-Signature-256 ("sha256=<hex>") sobre o corpo BRUTO. */
export async function verifyMetaSignature(rawBody: Uint8Array<ArrayBuffer>, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !header.startsWith('sha256=') || !appSecret) return false;
  const expected = 'sha256=' + (await hmacSha256Hex(appSecret, rawBody));
  return timingSafeEqual(expected, header.trim().toLowerCase());
}

/* ---------- telefones ---------- */
/** Mesma regra de toE164 (rules.ts). */
export function toE164(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  const n = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (!/^[1-9]{2}9?\d{8}$/.test(n)) return null;
  return `+55${n}`;
}

/**
 * O WhatsApp entrega números brasileiros antigos SEM o 9º dígito (ex.: 555491234567).
 * Para celulares (8 dígitos começando com 6–9) inserimos o 9, alinhando com o cadastro.
 */
export function normalizeWaPhone(waId: string): string | null {
  const d = waId.replace(/\D/g, '');
  if (/^55[1-9]{2}[6-9]\d{7}$/.test(d)) return `+${d.slice(0, 4)}9${d.slice(4)}`;
  return toE164(d);
}

/** E.164 → formato aceito pela Cloud API (só dígitos). */
export const waDigits = (e164: string) => e164.replace(/\D/g, '');

/** texto normalizado para comparar respostas de botão ("Confirmar", "SIM", "não"...) */
export function normalizeReply(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}

/** nomes das variáveis na ordem em que aparecem no corpo (parâmetros nomeados da Cloud API) */
export function templateVarNames(body: string): string[] {
  const names: string[] = [];
  for (const m of body.matchAll(/\{\{(\w+)\}\}/g)) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}

export function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  // logs estruturados SEM dados pessoais (nada de telefone completo ou texto de mensagem)
  console[level === 'info' ? 'log' : level](JSON.stringify({ level, msg, ...extra }));
}

export const maskPhone = (p: string) => p.replace(/\d(?=\d{4})/g, '•');
