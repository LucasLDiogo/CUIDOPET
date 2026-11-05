// Cliente mínimo da WhatsApp Cloud API (Meta). Token e phone number id vêm SÓ do ambiente do servidor.
import { env, log, waDigits } from './util.ts';

export type WaSendResult = { ok: true; waMessageId: string; dryRun: boolean } | { ok: false; error: string; status?: number };

type TextPayload = { kind: 'text'; to: string; body: string };
type TemplatePayload = { kind: 'template'; to: string; name: string; language: string; params: { name: string; value: string }[] };

export function isDryRun(): boolean {
  return (Deno.env.get('WA_DRY_RUN') ?? '').toLowerCase() === 'true' || !Deno.env.get('WA_TOKEN');
}

export async function sendWhatsApp(payload: TextPayload | TemplatePayload, phoneNumberId?: string | null): Promise<WaSendResult> {
  if (isDryRun()) {
    // ambiente local / sem credenciais: não chama a Meta, só simula o id
    return { ok: true, waMessageId: `dryrun.${crypto.randomUUID()}`, dryRun: true };
  }
  const version = Deno.env.get('WA_GRAPH_VERSION') || 'v21.0';
  const pnid = phoneNumberId || env('WA_PHONE_NUMBER_ID');
  const body =
    payload.kind === 'text'
      ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: waDigits(payload.to), type: 'text', text: { preview_url: false, body: payload.body } }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: waDigits(payload.to),
          type: 'template',
          template: {
            name: payload.name,
            language: { code: payload.language },
            // templates aprovados com parâmetros NOMEADOS ({{nome}}, {{pet}} ...)
            components: payload.params.length
              ? [{ type: 'body', parameters: payload.params.map((p) => ({ type: 'text', parameter_name: p.name, text: p.value || '-' })) }]
              : [],
          },
        };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${pnid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('WA_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = String(data?.error?.message ?? `HTTP ${res.status}`).slice(0, 300);
      log('warn', 'cloud_api_erro', { status: res.status, code: data?.error?.code });
      return { ok: false, error, status: res.status };
    }
    const id = data?.messages?.[0]?.id;
    return id ? { ok: true, waMessageId: String(id), dryRun: false } : { ok: false, error: 'resposta sem message id' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'falha de rede' };
  } finally {
    clearTimeout(timer);
  }
}
