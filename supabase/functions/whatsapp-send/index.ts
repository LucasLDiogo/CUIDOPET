// whatsapp-send — envia texto ou template pela WhatsApp Cloud API e grava a mensagem na conversa.
//
// Modos:
//   1) Prestador (JWT de usuário):  POST { conversationId?, bookingId?, text?, template? }
//        - a conversa/reserva precisa pertencer a um provider do usuário (checado no banco)
//        - fora da janela de 24 h desde a última mensagem do cliente → só template
//        - template utility exige wa_opt_in; marketing exige marketing_opt_in (LGPD)
//        - rate limit simples por provider (WA_RATE_LIMIT_PER_MIN, padrão 20/min)
//   2) Despachante (Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>):  POST { messageId } ou payload de Database Webhook
//        - envia uma mensagem já gravada com delivery = 'enviando' (ex.: "pedido_recebido" criada por create_booking).
//          Ligue um Database Webhook em messages (INSERT) ou um cron para chamar este modo.
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { adminClient, fillTemplate, json, log, templateVarNames, timingSafeEqual, userClient } from '../_shared/util.ts';
import { isDryRun, sendWhatsApp } from '../_shared/whatsapp.ts';

type Body = {
  conversationId?: string; bookingId?: string; text?: string; template?: string; messageId?: string;
  // formato do Database Webhook do Supabase (INSERT em public.messages)
  type?: string; table?: string; record?: { id?: string; delivery?: string };
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE = Number(Deno.env.get('WA_RATE_LIMIT_PER_MIN') ?? '20');
const DAY_MS = 24 * 3600 * 1000;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const cors = corsHeaders(req);
  if (req.method !== 'POST') return json({ error: 'metodo_nao_permitido' }, 405, cors);

  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'nao_autenticado' }, 401, cors);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'json_invalido' }, 400, cors);
  }
  const admin = adminClient();

  try {
    /* ---------- modo despachante (service role) ---------- */
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (serviceKey && timingSafeEqual(authorization.slice(7), serviceKey)) {
      const messageId = body.messageId ?? (body.table === 'messages' && body.type === 'INSERT' ? body.record?.id : undefined);
      if (!messageId || !UUID.test(messageId)) return json({ error: 'messageId_invalido' }, 400, cors);
      return json(await dispatchPending(admin, messageId), 200, cors);
    }

    /* ---------- modo prestador ---------- */
    const user = userClient(authorization);
    const { data: auth, error: authErr } = await user.auth.getUser();
    if (authErr || !auth?.user) return json({ error: 'nao_autenticado' }, 401, cors);
    const uid = auth.user.id;

    if (body.conversationId && !UUID.test(body.conversationId)) return json({ error: 'conversationId_invalido' }, 400, cors);
    if (body.bookingId && !UUID.test(body.bookingId)) return json({ error: 'bookingId_invalido' }, 400, cors);
    if (!body.conversationId && !body.bookingId) return json({ error: 'informe conversationId ou bookingId' }, 400, cors);
    if (!body.text && !body.template) return json({ error: 'informe text ou template' }, 400, cors);
    if (body.text && (body.text.length > 4096 || !body.text.trim())) return json({ error: 'texto_invalido' }, 400, cors);
    if (body.template && !/^[a-z0-9_]{1,128}$/.test(body.template)) return json({ error: 'template_invalido' }, 400, cors);

    // providers do usuário (fonte da verdade da autorização)
    const { data: provs } = await admin.from('providers').select('id, name').eq('owner_user_id', uid);
    const providerIds = new Set((provs ?? []).map((p) => p.id as string));
    if (providerIds.size === 0) return json({ error: 'proibido' }, 403, cors);

    // conversa: pela id ou derivada da reserva
    let conversation: Record<string, any> | null = null;
    let booking: Record<string, any> | null = null;
    if (body.bookingId) {
      const { data } = await admin.from('bookings').select('id, provider_id, customer_id, status').eq('id', body.bookingId).maybeSingle();
      if (!data || !providerIds.has(data.provider_id)) return json({ error: 'nao_encontrado' }, 404, cors);
      booking = data;
    }
    if (body.conversationId) {
      const { data } = await admin.from('conversations').select('*').eq('id', body.conversationId).maybeSingle();
      if (!data || !providerIds.has(data.provider_id)) return json({ error: 'nao_encontrado' }, 404, cors);
      conversation = data;
    } else if (booking) {
      const { data: cust } = await admin.from('customers').select('phone').eq('id', booking.customer_id).single();
      if (!cust?.phone) return json({ error: 'cliente_sem_telefone' }, 422, cors);
      const { data } = await admin
        .from('conversations')
        .upsert({ provider_id: booking.provider_id, customer_id: booking.customer_id, phone: cust.phone, booking_id: booking.id }, { onConflict: 'provider_id,phone' })
        .select('*')
        .single();
      conversation = data;
    }
    if (!conversation) return json({ error: 'nao_encontrado' }, 404, cors);
    if (!booking && conversation.booking_id) {
      const { data } = await admin.from('bookings').select('id, provider_id, customer_id, status').eq('id', conversation.booking_id).maybeSingle();
      booking = data;
    }

    // rate limit por provider
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', conversation.provider_id)
      .in('from_actor', ['prestador', 'bot'])
      .gte('at', since);
    if ((count ?? 0) >= RATE) return json({ error: 'limite_de_envio', retryAfterSec: 60 }, 429, { ...cors, 'Retry-After': '60' });

    const { data: customer } = await admin.from('customers').select('id, name, phone, wa_opt_in, marketing_opt_in').eq('id', conversation.customer_id).single();
    const { data: settings } = await admin.from('provider_settings').select('wa_phone_number_id').eq('provider_id', conversation.provider_id).maybeSingle();
    const providerName = (provs ?? []).find((p) => p.id === conversation!.provider_id)?.name ?? '';

    let text: string;
    let templateRow: Record<string, any> | null = null;
    let params: { name: string; value: string }[] = [];
    if (body.template) {
      const { data: tpls } = await admin
        .from('wa_templates')
        .select('*')
        .eq('name', body.template)
        .or(`provider_id.is.null,provider_id.eq.${conversation.provider_id}`);
      templateRow = (tpls ?? []).sort((a, b) => (a.provider_id ? -1 : 1) - (b.provider_id ? -1 : 1))[0] ?? null;
      if (!templateRow || !templateRow.approved) return json({ error: 'template_nao_aprovado' }, 422, cors);
      if (templateRow.category === 'marketing' && !customer?.marketing_opt_in) return json({ error: 'sem_consentimento_marketing' }, 409, cors);
      if (templateRow.category === 'utility' && !customer?.wa_opt_in) return json({ error: 'sem_consentimento_whatsapp' }, 409, cors);
      let vars: Record<string, string> = { nome: (customer?.name ?? '').split(' ')[0], prestador: providerName };
      if (booking) {
        const { data: bv } = await admin.rpc('wa_template_vars', { p_booking_id: booking.id });
        vars = { ...vars, ...((bv as Record<string, string>) ?? {}) };
      }
      text = fillTemplate(templateRow.body, vars);
      params = templateVarNames(templateRow.body).map((n) => ({ name: n, value: vars[n] ?? '' }));
    } else {
      // texto livre só dentro da janela de 24 h aberta pelo cliente (regra da Meta)
      const lastIn = conversation.last_inbound_at ? Date.parse(conversation.last_inbound_at) : 0;
      if (!lastIn || Date.now() - lastIn > DAY_MS) return json({ error: 'fora_da_janela_24h', hint: 'use um template aprovado' }, 409, cors);
      text = body.text!.trim();
    }

    const result = await sendWhatsApp(
      templateRow
        ? { kind: 'template', to: customer!.phone, name: templateRow.name, language: templateRow.language ?? 'pt_BR', params }
        : { kind: 'text', to: customer!.phone, body: text },
      settings?.wa_phone_number_id,
    );

    const { data: msg, error: insErr } = await admin
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        provider_id: conversation.provider_id,
        from_actor: templateRow ? 'bot' : 'prestador',
        text,
        template: templateRow?.name ?? null,
        buttons: templateRow?.buttons?.length ? templateRow.buttons : null,
        delivery: result.ok ? 'enviado' : 'falhou',
        wa_message_id: result.ok ? result.waMessageId : null,
        error: result.ok ? null : result.error,
      })
      .select('*')
      .single();
    if (insErr) throw insErr;
    // o template de confirmação mantém a conversa "aguardando cliente"
    if (templateRow?.name === 'confirmacao_agendamento') {
      await admin.from('conversations').update({ status: 'aguardando_cliente', booking_id: booking?.id ?? conversation.booking_id }).eq('id', conversation.id);
    }
    log('info', 'wa_send', { provider: conversation.provider_id, template: templateRow?.name ?? null, ok: result.ok, dryRun: result.ok && result.dryRun });
    return json({ message: msg, dryRun: isDryRun() }, 200, cors);
  } catch (e) {
    log('error', 'wa_send_falha', { err: e instanceof Error ? e.message : String(e) });
    return json({ error: 'erro_interno' }, 500, cors);
  }
});

async function dispatchPending(admin: ReturnType<typeof adminClient>, messageId: string) {
  const { data: msg } = await admin.from('messages').select('*').eq('id', messageId).maybeSingle();
  if (!msg || msg.delivery !== 'enviando') return { skipped: true };
  const { data: conv } = await admin.from('conversations').select('customer_id, provider_id, phone').eq('id', msg.conversation_id).single();
  const { data: cust } = await admin.from('customers').select('wa_opt_in').eq('id', conv!.customer_id).single();
  if (!cust?.wa_opt_in) {
    await admin.from('messages').update({ delivery: 'falhou', error: 'sem consentimento de WhatsApp' }).eq('id', msg.id);
    return { skipped: true, reason: 'sem_consentimento' };
  }
  const { data: settings } = await admin.from('provider_settings').select('wa_phone_number_id').eq('provider_id', conv!.provider_id).maybeSingle();
  let result;
  if (msg.template) {
    const { data: tpl } = await admin.from('wa_templates').select('*').eq('name', msg.template).is('provider_id', null).maybeSingle();
    if (!tpl?.approved) {
      await admin.from('messages').update({ delivery: 'falhou', error: 'template não aprovado' }).eq('id', msg.id);
      return { skipped: true, reason: 'template_nao_aprovado' };
    }
    // reconstrói os parâmetros a partir do texto já preenchido não é confiável → recalcula pela conversa/reserva
    const { data: c2 } = await admin.from('conversations').select('booking_id').eq('id', msg.conversation_id).single();
    const { data: vars } = c2?.booking_id ? await admin.rpc('wa_template_vars', { p_booking_id: c2.booking_id }) : { data: {} };
    const v = (vars ?? {}) as Record<string, string>;
    result = await sendWhatsApp(
      { kind: 'template', to: conv!.phone, name: tpl.name, language: tpl.language ?? 'pt_BR', params: templateVarNames(tpl.body).map((n) => ({ name: n, value: v[n] ?? '' })) },
      settings?.wa_phone_number_id,
    );
  } else {
    result = await sendWhatsApp({ kind: 'text', to: conv!.phone, body: msg.text }, settings?.wa_phone_number_id);
  }
  await admin
    .from('messages')
    .update(result.ok ? { delivery: 'enviado', wa_message_id: result.waMessageId } : { delivery: 'falhou', error: result.error })
    .eq('id', msg.id)
    .eq('delivery', 'enviando');
  return { sent: result.ok };
}
