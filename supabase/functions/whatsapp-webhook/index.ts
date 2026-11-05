// whatsapp-webhook — recebe eventos da WhatsApp Cloud API (Meta).
//
// GET  : verificação do webhook (hub.mode=subscribe & hub.verify_token == WA_VERIFY_TOKEN → devolve hub.challenge)
// POST : 1) valida X-Hub-Signature-256 = HMAC-SHA256(corpo BRUTO, WA_APP_SECRET), comparação em tempo constante
//        2) responde 200 imediatamente e processa em segundo plano (EdgeRuntime.waitUntil)
//        3) idempotência: cada wamid entra uma única vez em wa_webhook_events
//        4) grava a mensagem do cliente na conversa (provider ↔ telefone)
//        5) botão/texto "Confirmar"/"SIM" numa reserva aguardando_cliente → confirma; "Remarcar"/"Cancelar" tratados
//        6) "Parar de receber" → revoga consentimento de marketing (LGPD)
import { adminClient, json, log, maskPhone, normalizeReply, normalizeWaPhone, timingSafeEqual, verifyMetaSignature } from '../_shared/util.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

type Admin = ReturnType<typeof adminClient>;
type WaMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
  button?: { text?: string; payload?: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  context?: { id?: string };
};
type WaStatus = { id: string; status: 'sent' | 'delivered' | 'read' | 'failed'; recipient_id?: string; errors?: { title?: string }[] };

const REPLY_SIM = new Set(['confirmar', 'sim', 's', 'confirmo', 'confirmado', 'ok confirmar']);
const REPLY_NAO = new Set(['cancelar', 'nao', 'n', 'cancela', 'nao quero', 'cancelar agendamento']);
const REPLY_REMARCAR = new Set(['remarcar', 'preciso remarcar', 'reagendar', 'remarca']);
const REPLY_OPT_OUT = new Set(['parar de receber', 'parar', 'sair', 'stop', 'descadastrar']);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') ?? '';
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    const expected = Deno.env.get('WA_VERIFY_TOKEN') ?? '';
    if (mode === 'subscribe' && expected && timingSafeEqual(token, expected) && /^[\w-]{1,200}$/.test(challenge)) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > 1_000_000) return new Response('payload too large', { status: 413 });
  const ok = await verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), Deno.env.get('WA_APP_SECRET') ?? '');
  if (!ok) {
    log('warn', 'webhook_assinatura_invalida');
    return new Response('invalid signature', { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const work = processPayload(payload).catch((e) => log('error', 'webhook_falha', { err: e instanceof Error ? e.message : String(e) }));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
  else await work; // fora do edge runtime (testes locais), processa antes de responder
  return json({ received: true });
});

async function processPayload(payload: any) {
  if (payload?.object !== 'whatsapp_business_account') return;
  const admin = adminClient();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value ?? {};
      const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
      const contacts: { wa_id: string; profile?: { name?: string } }[] = value.contacts ?? [];
      for (const st of (value.statuses ?? []) as WaStatus[]) await handleStatus(admin, st, phoneNumberId);
      for (const msg of (value.messages ?? []) as WaMessage[]) {
        const name = contacts.find((c) => c.wa_id === msg.from)?.profile?.name;
        await handleMessage(admin, msg, phoneNumberId, name);
      }
    }
  }
}

/** registra o evento uma única vez; devolve false se já processado */
async function claim(admin: Admin, id: string, kind: 'message' | 'status', phoneNumberId: string | undefined, payload: unknown): Promise<boolean> {
  const { data, error } = await admin
    .from('wa_webhook_events')
    .upsert({ id, kind, phone_number_id: phoneNumberId ?? null, payload }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function done(admin: Admin, id: string, result: string) {
  await admin.from('wa_webhook_events').update({ processed_at: new Date().toISOString(), result: result.slice(0, 300) }).eq('id', id);
}

async function handleStatus(admin: Admin, st: WaStatus, phoneNumberId?: string) {
  const key = `${st.id}:${st.status}`;
  if (!(await claim(admin, key, 'status', phoneNumberId, { id: st.id, status: st.status }))) return;
  const delivery = st.status === 'sent' ? 'enviado' : st.status === 'delivered' ? 'entregue' : st.status === 'read' ? 'lido' : 'falhou';
  // não "regride" (ex.: delivered chegando depois de read)
  const order = ['enviando', 'enviado', 'entregue', 'lido'];
  const { data: msg } = await admin.from('messages').select('id, delivery').eq('wa_message_id', st.id).maybeSingle();
  if (msg && (delivery === 'falhou' || order.indexOf(delivery) > order.indexOf(msg.delivery))) {
    await admin
      .from('messages')
      .update({ delivery, error: delivery === 'falhou' ? (st.errors?.[0]?.title ?? 'falha na entrega').slice(0, 300) : null })
      .eq('id', msg.id);
  }
  await done(admin, key, msg ? `delivery=${delivery}` : 'mensagem_desconhecida');
}

function messageText(msg: WaMessage): string {
  if (msg.type === 'text') return msg.text?.body ?? '';
  if (msg.type === 'button') return msg.button?.text ?? msg.button?.payload ?? '';
  if (msg.type === 'interactive') return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '';
  return `[${msg.type}]`; // mídia, localização etc. — conteúdo não é baixado aqui
}

async function handleMessage(admin: Admin, msg: WaMessage, phoneNumberId: string | undefined, profileName?: string) {
  // payload mínimo guardado (sem o corpo completo do webhook)
  if (!(await claim(admin, msg.id, 'message', phoneNumberId, { id: msg.id, type: msg.type, context: msg.context?.id ?? null }))) return;
  const phone = normalizeWaPhone(msg.from);
  if (!phone) return done(admin, msg.id, 'telefone_invalido');
  const text = messageText(msg).slice(0, 4096);
  const at = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();

  // 1) conversa: pelo contexto (resposta a uma mensagem nossa) → mais confiável
  let conversation: { id: string; provider_id: string; customer_id: string; booking_id: string | null } | null = null;
  if (msg.context?.id) {
    const { data } = await admin.from('messages').select('conversation_id').eq('wa_message_id', msg.context.id).maybeSingle();
    if (data) {
      const { data: c } = await admin.from('conversations').select('id, provider_id, customer_id, booking_id').eq('id', data.conversation_id).single();
      conversation = c;
    }
  }
  // 2) senão, pelo número de negócio que recebeu (provider_settings.wa_phone_number_id) + telefone do cliente
  if (!conversation && phoneNumberId) {
    const { data: s } = await admin.from('provider_settings').select('provider_id').eq('wa_phone_number_id', phoneNumberId).maybeSingle();
    if (s) {
      const { data: c } = await admin.from('conversations').select('id, provider_id, customer_id, booking_id').eq('provider_id', s.provider_id).eq('phone', phone).maybeSingle();
      conversation = c;
      if (!conversation) {
        // novo contato: reaproveita customer com o mesmo telefone ou cria um contato de CRM (sem consentimento de marketing)
        let { data: cust } = await admin.from('customers').select('id').eq('phone', phone).order('created_at').limit(1).maybeSingle();
        if (!cust) {
          const created = await admin
            .from('customers')
            .insert({ name: (profileName ?? 'Contato WhatsApp').slice(0, 120), phone, wa_opt_in: false, marketing_opt_in: false })
            .select('id')
            .single();
          cust = created.data;
        }
        await admin.from('provider_customers').upsert({ provider_id: s.provider_id, customer_id: cust!.id, source: 'whatsapp' }, { onConflict: 'provider_id,customer_id', ignoreDuplicates: true });
        const { data: c2 } = await admin
          .from('conversations')
          .insert({ provider_id: s.provider_id, customer_id: cust!.id, phone, status: 'novo', tags: ['lead'] })
          .select('id, provider_id, customer_id, booking_id')
          .single();
        conversation = c2;
      }
    }
  }
  if (!conversation) {
    log('warn', 'webhook_sem_prestador', { phone: maskPhone(phone) });
    return done(admin, msg.id, 'sem_prestador');
  }

  await admin.from('messages').insert({
    conversation_id: conversation.id,
    provider_id: conversation.provider_id,
    from_actor: 'cliente',
    text: text || '[mensagem vazia]',
    at,
    delivery: 'entregue',
    wa_message_id: msg.id,
  });

  // 3) intenção
  const norm = normalizeReply(text);
  const reply = REPLY_SIM.has(norm) ? 'SIM' : REPLY_NAO.has(norm) ? 'NAO' : REPLY_REMARCAR.has(norm) ? 'REMARCAR' : null;

  if (REPLY_OPT_OUT.has(norm)) {
    await admin.from('customers').update({ marketing_opt_in: false }).eq('id', conversation.customer_id);
    return done(admin, msg.id, 'opt_out_marketing');
  }
  if (!reply) return done(admin, msg.id, 'mensagem_gravada');

  // reserva alvo: a da conversa (se aguardando) ou a mais recente aguardando o cliente com esse prestador
  let bookingId: string | null = null;
  if (conversation.booking_id) {
    const { data } = await admin.from('bookings').select('id, status').eq('id', conversation.booking_id).maybeSingle();
    if (data?.status === 'aguardando_cliente') bookingId = data.id;
  }
  if (!bookingId) {
    const { data } = await admin
      .from('bookings')
      .select('id')
      .eq('provider_id', conversation.provider_id)
      .eq('customer_id', conversation.customer_id)
      .eq('status', 'aguardando_cliente')
      .order('wa_confirmation_sent_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    bookingId = data?.id ?? null;
  }
  if (!bookingId) return done(admin, msg.id, `resposta_${reply}_sem_reserva_pendente`);

  const { error } = await admin.rpc('wa_apply_confirmation', { p_booking_id: bookingId, p_reply: reply });
  if (error) {
    log('warn', 'webhook_confirmacao_recusada', { code: error.code, msg: error.message });
    return done(admin, msg.id, `erro_${error.code}`);
  }
  await done(admin, msg.id, `reserva_${reply}`);
}
