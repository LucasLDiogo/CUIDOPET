-- 0007 — fluxos transacionais no banco: transições guardadas, aceite de proposta, pagamento, hold/expiração.
-- Estados válidos vivem em `state_transitions` (gerada a partir de packages/domain; teste de drift em database/tests).

create table public.state_transitions (
  machine text not null,
  from_state text not null,
  to_state text not null,
  primary key (machine, from_state, to_state)
);
insert into public.state_transitions(machine, from_state, to_state) values
('profile','draft','submitted'),
  ('profile','draft','archived'),
  ('profile','submitted','reviewing'),
  ('profile','submitted','draft'),
  ('profile','reviewing','published'),
  ('profile','reviewing','needs_changes'),
  ('profile','reviewing','rejected'),
  ('profile','needs_changes','submitted'),
  ('profile','needs_changes','archived'),
  ('profile','published','suspended'),
  ('profile','published','needs_changes'),
  ('profile','published','archived'),
  ('profile','suspended','reviewing'),
  ('profile','suspended','archived'),
  ('profile','rejected','draft'),
  ('profile','rejected','archived'),
  ('request','open','discussing'),
  ('request','open','quoted'),
  ('request','open','declined'),
  ('request','open','expired'),
  ('request','open','cancelled'),
  ('request','discussing','quoted'),
  ('request','discussing','declined'),
  ('request','discussing','expired'),
  ('request','discussing','cancelled'),
  ('request','quoted','accepted'),
  ('request','quoted','discussing'),
  ('request','quoted','declined'),
  ('request','quoted','expired'),
  ('request','quoted','cancelled'),
  ('quote','draft','sent'),
  ('quote','sent','accepted'),
  ('quote','sent','revised'),
  ('quote','sent','expired'),
  ('quote','sent','rejected'),
  ('booking','awaiting_payment','confirmed'),
  ('booking','awaiting_payment','cancelled'),
  ('booking','confirmed','ready'),
  ('booking','confirmed','cancelled'),
  ('booking','confirmed','no_show'),
  ('booking','ready','in_progress'),
  ('booking','ready','cancelled'),
  ('booking','ready','no_show'),
  ('booking','in_progress','completed'),
  ('booking','in_progress','interrupted'),
  ('booking','interrupted','completed'),
  ('booking','interrupted','cancelled'),
  ('subscription','pending','active'),
  ('subscription','pending','cancelled'),
  ('subscription','active','past_due'),
  ('subscription','active','cancel_at_period_end'),
  ('subscription','active','cancelled'),
  ('subscription','past_due','active'),
  ('subscription','past_due','suspended'),
  ('subscription','past_due','cancelled'),
  ('subscription','suspended','active'),
  ('subscription','suspended','cancelled'),
  ('subscription','cancel_at_period_end','active'),
  ('subscription','cancel_at_period_end','cancelled'),
  ('payment','created','pending'),
  ('payment','created','failed'),
  ('payment','created','expired'),
  ('payment','pending','confirmed'),
  ('payment','pending','failed'),
  ('payment','pending','expired'),
  ('payment','confirmed','settled'),
  ('payment','confirmed','refund_pending'),
  ('payment','confirmed','chargeback'),
  ('payment','settled','refund_pending'),
  ('payment','settled','chargeback'),
  ('payment','refund_pending','partially_refunded'),
  ('payment','refund_pending','refunded'),
  ('payment','refund_pending','confirmed'),
  ('payment','refund_pending','settled'),
  ('payment','partially_refunded','refund_pending'),
  ('payment','partially_refunded','chargeback'),
  ('verification','not_started','pending'),
  ('verification','pending','needs_information'),
  ('verification','pending','approved'),
  ('verification','pending','rejected'),
  ('verification','needs_information','pending'),
  ('verification','needs_information','rejected'),
  ('verification','approved','expired'),
  ('verification','approved','revoked'),
  ('verification','expired','pending'),
  ('verification','rejected','pending');

create or replace function app.guard_status_transition() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and not exists (
      select 1 from public.state_transitions where machine = tg_argv[0] and from_state = old.status and to_state = new.status) then
    raise exception 'invalid_transition: % % -> %', tg_argv[0], old.status, new.status using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger provider_profiles_guard before update of status on public.provider_profiles for each row execute function app.guard_status_transition('profile');
create trigger service_requests_guard before update of status on public.service_requests for each row execute function app.guard_status_transition('request');
create trigger quotes_guard before update of status on public.quotes for each row execute function app.guard_status_transition('quote');
create trigger bookings_guard before update of status on public.bookings for each row execute function app.guard_status_transition('booking');
create trigger payments_guard before update of status on public.payments for each row execute function app.guard_status_transition('payment');
create trigger subscriptions_guard before update of status on public.subscriptions for each row execute function app.guard_status_transition('subscription');
create trigger verifications_guard before update of status on public.verifications for each row execute function app.guard_status_transition('verification');

create or replace function app.is_provider_member(p_provider uuid) returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.provider_profiles pp where pp.id = p_provider and app.is_org_member(pp.organization_id))
$$;
revoke all on function app.is_provider_member(uuid) from public;
grant execute on function app.is_provider_member(uuid) to cuidope_app, cuidope_service;

create or replace function app.emit(p_type text, p_agg text, p_id uuid, p_payload jsonb default '{}') returns void language sql as $$
  insert into public.outbox(event_type, aggregate_type, aggregate_id, payload) values (p_type, p_agg, p_id, p_payload)
$$;

-- ── Perfil: submissão e revisão ─────────────────────────────────────────────
create or replace function app.submit_profile(p_profile uuid) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not app.is_provider_member(p_profile) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.provider_profiles where id = p_profile and bio is not null and length(bio) >= 20) then
    raise exception 'profile_incomplete: bio com ao menos 20 caracteres' using errcode = 'check_violation';
  end if;
  update public.provider_profiles set status = 'submitted' where id = p_profile;
  perform app.emit('ProviderSubmitted', 'provider_profile', p_profile);
end $$;

create or replace function app.review_profile(p_profile uuid, p_to text, p_reason text) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not app.has_role('trust_safety') then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if p_to = 'published' and not exists (select 1 from public.verifications v where v.provider_id = p_profile and v.kind = 'identity' and v.status = 'approved' and v.valid_until > now()) then
    raise exception 'identity_not_verified: verificação básica é requisito de publicação' using errcode = 'check_violation';
  end if;
  update public.provider_profiles set status = p_to, published_at = case when p_to = 'published' then now() else published_at end where id = p_profile;
  perform app.audit('profile.' || p_to, 'provider_profile', p_profile, p_reason);
  perform app.emit(case p_to when 'published' then 'ProviderPublished' when 'suspended' then 'ProviderSuspended' else 'ProviderReviewed' end, 'provider_profile', p_profile, jsonb_build_object('to', p_to));
end $$;

-- ── Solicitação, proposta, aceite ───────────────────────────────────────────
create or replace function app.create_request(p_listing uuid, p_period tstzrange, p_message text, p_pets uuid[]) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare uid uuid := app.uid(); l record; rid uuid; conv uuid; pid uuid; pt record;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = 'insufficient_privilege'; end if;
  select sl.*, pp.status as pstatus, pp.organization_id as org into l from public.service_listings sl join public.provider_profiles pp on pp.id = sl.provider_id where sl.id = p_listing;
  if not found or l.status <> 'published' or l.pstatus <> 'published' then raise exception 'listing_unavailable' using errcode = 'check_violation'; end if;
  if coalesce(array_length(p_pets, 1), 0) = 0 then raise exception 'no_pets' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.memberships m where m.organization_id = l.org and m.user_id = uid and m.status = 'active') then
    raise exception 'self_request' using errcode = 'check_violation';   -- prestador não contrata a si mesmo
  end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id = uid and b.blocked_id in (select user_id from public.memberships where organization_id = l.org and status='active'))
                                                   or (b.blocked_id = uid and b.blocker_id in (select user_id from public.memberships where organization_id = l.org and status='active'))) then
    raise exception 'blocked' using errcode = 'insufficient_privilege';
  end if;
  insert into public.service_requests(tutor_id, provider_id, listing_id, period, message) values (uid, l.provider_id, p_listing, p_period, p_message) returning id into rid;
  foreach pid in array p_pets loop
    select * into pt from public.pets where id = pid;
    if not found or pt.tutor_id <> uid then raise exception 'pet_not_owned' using errcode = 'insufficient_privilege'; end if;
    insert into public.request_pets(request_id, pet_id, need_snapshot) values (rid, pid, jsonb_build_object('species', pt.species_code, 'size', pt.size));
  end loop;
  insert into public.conversations(request_id) values (rid) returning id into conv;
  insert into public.conversation_participants(conversation_id, user_id, participant_role) values (conv, uid, 'tutor');
  insert into public.conversation_participants(conversation_id, user_id, participant_role)
    select conv, m.user_id, 'provider' from public.memberships m where m.organization_id = l.org and m.status = 'active';
  perform app.emit('RequestCreated', 'service_request', rid);
  return rid;
end $$;

create or replace function app.send_quote(p_request uuid, p_items jsonb, p_valid_until timestamptz, p_policy jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare uid uuid := app.uid(); r record; v integer; qid uuid; it jsonb; total bigint := 0;
begin
  select * into r from public.service_requests where id = p_request for update;
  if not found then raise exception 'request_not_found' using errcode = 'no_data_found'; end if;
  if not app.is_provider_member(r.provider_id) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if r.status not in ('open','discussing','quoted') then raise exception 'request_closed: %', r.status using errcode = 'check_violation'; end if;
  if p_valid_until <= now() then raise exception 'quote_validity_in_past' using errcode = 'check_violation'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    total := total + (it->>'quantity')::bigint * (it->>'unit_price_cents')::bigint;
  end loop;
  if total <= 0 then raise exception 'quote_empty' using errcode = 'check_violation'; end if;
  select coalesce(max(version), 0) + 1 into v from public.quotes where request_id = p_request;
  update public.quotes set status = 'revised' where request_id = p_request and status = 'sent';
  insert into public.quotes(request_id, version, status, total_cents, valid_until, policy_snapshot, created_by)
    values (p_request, v, 'draft', total, p_valid_until, p_policy, uid) returning id into qid;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.quote_items(quote_id, description, quantity, unit_price_cents, total_cents)
    values (qid, it->>'description', (it->>'quantity')::int, (it->>'unit_price_cents')::int, (it->>'quantity')::int * (it->>'unit_price_cents')::int);
  end loop;
  update public.quotes set status = 'sent' where id = qid;
  if r.status <> 'quoted' then update public.service_requests set status = 'quoted' where id = p_request; end if;
  perform app.emit('QuoteSent', 'quote', qid, jsonb_build_object('version', v));
  return qid;
end $$;

create or replace function app.accept_quote(p_quote uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare uid uuid := app.uid(); q record; r record; l record; pr record; pet record; prev jsonb; bk uuid; ord uuid;
        bps integer; ttl integer; n_pets integer := 0; units integer; tz text; res jsonb; exp timestamptz;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = 'insufficient_privilege'; end if;
  if p_key is null or length(p_key) < 8 then raise exception 'idempotency_key_required' using errcode = 'check_violation'; end if;
  select response into prev from public.idempotency_keys where user_id = uid and scope = 'accept_quote' and key = p_key;
  if found then return prev; end if;

  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'quote_not_found' using errcode = 'no_data_found'; end if;
  select * into r from public.service_requests where id = q.request_id for update;
  if r.tutor_id <> uid then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  if q.status <> 'sent' then raise exception 'quote_not_open: %', q.status using errcode = 'check_violation'; end if;
  if q.valid_until <= now() then raise exception 'quote_expired' using errcode = 'check_violation'; end if;

  select * into l from public.service_listings where id = r.listing_id;
  select * into pr from public.provider_profiles where id = r.provider_id;
  if l.status <> 'published' or pr.status <> 'published' then raise exception 'listing_unavailable' using errcode = 'check_violation'; end if;

  for pet in select p.* from public.request_pets rp join public.pets p on p.id = rp.pet_id where rp.request_id = r.id loop
    n_pets := n_pets + 1;
    if pet.tutor_id <> uid then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
    if not exists (select 1 from public.listing_species ls where ls.listing_id = l.id and ls.species_code = pet.species_code) then
      raise exception 'species_not_accepted: %', pet.species_code using errcode = 'check_violation'; end if;
    if not (pet.size = any (l.accepted_sizes)) then raise exception 'size_not_accepted: %', pet.size using errcode = 'check_violation'; end if;
    if not exists (select 1 from public.region_enablement re where re.region_id = pr.city_region_id and re.category_code = l.category_code and re.species_code = pet.species_code and re.enabled) then
      raise exception 'not_enabled_in_region' using errcode = 'check_violation'; end if;
  end loop;
  if n_pets = 0 then raise exception 'no_pets' using errcode = 'check_violation'; end if;

  units := n_pets * l.units_per_pet;
  select (value)::int into bps from public.platform_settings where key = 'commission_bps';
  select (value)::int into ttl from public.platform_settings where key = 'hold_ttl_minutes';
  select timezone into tz from public.resources where id = l.resource_id;

  insert into public.bookings(accepted_quote_id, tutor_id, provider_id, organization_id, listing_id, timezone, period, total_cents, commission_bps, policy_snapshot)
    values (q.id, uid, pr.id, pr.organization_id, l.id, tz, r.period, q.total_cents, bps,
            q.policy_snapshot || jsonb_build_object('cancellation_policy_version', l.cancellation_policy_version, 'price_unit', l.price_unit))
    returning id into bk;

  insert into public.booking_pets(booking_id, pet_id, care_plan_snapshot, capacity_units)
  select bk, p.id,
         jsonb_build_object('name', p.name, 'species', p.species_code, 'size', p.size, 'routine', cp.routine, 'feeding', cp.feeding,
                            'restrictions', cp.restrictions, 'behavior', cp.behavior, 'emergency_contact', cp.emergency_contact, 'vet_name', cp.vet_name),
         l.units_per_pet
    from public.request_pets rp join public.pets p on p.id = rp.pet_id
    left join lateral (select * from private.pet_care_plans c where c.pet_id = p.id order by version desc limit 1) cp on true
   where rp.request_id = r.id;

  perform app.reserve_capacity(bk, l.resource_id, r.period, units, make_interval(mins => ttl));
  select expires_at into exp from public.capacity_allocations where booking_id = bk and status = 'held';

  insert into public.orders(purpose, buyer_id, booking_id, subtotal_cents, total_cents, snapshot)
    values ('booking', uid, bk, q.total_cents, q.total_cents, jsonb_build_object('quote_id', q.id, 'quote_version', q.version, 'commission_bps', bps))
    returning id into ord;
  insert into public.order_lines(order_id, description, amount_cents)
    select ord, description, total_cents from public.quote_items where quote_id = q.id and total_cents > 0;

  update public.quotes set status = 'accepted' where id = q.id;
  update public.service_requests set status = 'accepted' where id = r.id;
  update public.conversations set booking_id = bk where request_id = r.id;

  perform app.emit('QuoteAccepted', 'quote', q.id);
  perform app.emit('CapacityHeld', 'booking', bk, jsonb_build_object('expires_at', exp));

  res := jsonb_build_object('booking_id', bk, 'order_id', ord, 'hold_expires_at', exp, 'total_cents', q.total_cents);
  insert into public.idempotency_keys(user_id, scope, key, response) values (uid, 'accept_quote', p_key, res);
  return res;
end $$;

-- ── Pagamentos (somente servidor) ───────────────────────────────────────────
create or replace function app.register_payment(p_order uuid, p_provider text, p_external_id text, p_method text, p_pix_expires timestamptz default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare o record; pid uuid;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'awaiting_payment' then raise exception 'order_not_payable' using errcode = 'check_violation'; end if;
  insert into public.payments(order_id, provider, external_id, purpose, amount_cents, method, status, pix_expires_at)
    values (p_order, p_provider, p_external_id, o.purpose, o.total_cents, p_method, 'pending', p_pix_expires) returning id into pid;
  return pid;
end $$;

create or replace function app.record_webhook(p_provider text, p_event_id text, p_type text, p_hash text, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
declare n integer;
begin
  insert into public.webhook_inbox(provider, event_id, event_type, payload_hash, payload) values (p_provider, p_event_id, p_type, p_hash, p_payload)
  on conflict (provider, event_id) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function app.confirm_payment(p_provider text, p_external_id text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare pay record; ord record; bk record; al record; ok boolean := false; commission bigint; share bigint; ttl integer; units integer; tx uuid; tutor uuid;
begin
  select * into pay from public.payments where provider = p_provider and external_id = p_external_id for update;
  if not found then raise exception 'payment_not_found' using errcode = 'no_data_found'; end if;
  if pay.status in ('confirmed','settled') then return jsonb_build_object('result', 'already_confirmed'); end if;
  if pay.status <> 'pending' then return jsonb_build_object('result', 'ignored', 'status', pay.status); end if;   -- fora de ordem: não regride

  select * into ord from public.orders where id = pay.order_id for update;
  if pay.amount_cents <> ord.total_cents then raise exception 'amount_mismatch' using errcode = 'check_violation'; end if;
  update public.payments set status = 'confirmed', confirmed_at = now() where id = pay.id;

  if ord.purpose = 'booking' then
    select * into bk from public.bookings where id = ord.booking_id for update;
    tutor := bk.tutor_id;
    select * into al from public.capacity_allocations where booking_id = bk.id and status in ('held','allocated');
    if found and (al.status = 'allocated' or al.expires_at > now()) then ok := true;
    elsif bk.status = 'awaiting_payment' then
      select coalesce(sum(capacity_units), 1) into units from public.booking_pets where booking_id = bk.id;
      select (value)::int into ttl from public.platform_settings where key = 'hold_ttl_minutes';
      begin
        perform app.reserve_capacity(bk.id, (select resource_id from public.service_listings where id = bk.listing_id), bk.period, units, make_interval(mins => ttl));
        select * into al from public.capacity_allocations where booking_id = bk.id and status = 'held';
        ok := true;
      exception when check_violation then ok := false;
      end;
    end if;

    if ok then
      update public.capacity_allocations set status = 'allocated', expires_at = null where id = al.id;
      update public.bookings set status = 'confirmed' where id = bk.id;
      update public.orders set status = 'paid' where id = ord.id;
      commission := (bk.total_cents::bigint * bk.commission_bps + 5000) / 10000;
      share := bk.total_cents - commission;
      perform app.post_ledger('payment:' || pay.id || ':confirmed', 'Pagamento de reserva confirmado',
        jsonb_build_array(jsonb_build_object('account','psp_cash','debit',bk.total_cents),
                          jsonb_build_object('account','provider_payable','credit',share))
        || case when commission > 0 then jsonb_build_array(jsonb_build_object('account','commission_revenue','credit',commission)) else '[]'::jsonb end);
      perform app.emit('PaymentConfirmed', 'payment', pay.id);
      perform app.emit('BookingConfirmed', 'booking', bk.id);
      return jsonb_build_object('result', 'confirmed', 'booking_id', bk.id);
    else
      -- Pagamento tardio sem vaga: dinheiro recebido, reserva NÃO confirmada → exceção + incidente (spec §14).
      update public.orders set status = 'paid_unallocated' where id = ord.id;
      perform app.post_ledger('payment:' || pay.id || ':confirmed', 'Pagamento recebido sem capacidade alocada',
        jsonb_build_array(jsonb_build_object('account','psp_cash','debit',pay.amount_cents),
                          jsonb_build_object('account','unallocated_payments','credit',pay.amount_cents)));
      insert into public.tickets(requester_id, booking_id, category, priority, subject, body)
        values (tutor, bk.id, 'pagamento', 'high', 'Pagamento recebido sem vaga disponível',
                'Pagamento ' || pay.id || ' confirmado após expiração da reserva; oferecer alternativa com aprovação ou reembolsar.');
      perform app.emit('PaymentUnallocated', 'payment', pay.id, jsonb_build_object('booking_id', bk.id));
      return jsonb_build_object('result', 'paid_unallocated', 'booking_id', bk.id);
    end if;

  elsif ord.purpose = 'subscription' then
    update public.subscriptions set status = 'active', current_period_end = now() + interval '30 days', grace_until = null where id = ord.subscription_id;
    update public.orders set status = 'paid' where id = ord.id;
    perform app.post_ledger('payment:' || pay.id || ':confirmed', 'Recebimento de assinatura',
      jsonb_build_array(jsonb_build_object('account','psp_cash','debit',pay.amount_cents), jsonb_build_object('account','subscription_revenue','credit',pay.amount_cents)));
    perform app.emit('SubscriptionActivated', 'subscription', ord.subscription_id);
    return jsonb_build_object('result', 'confirmed', 'subscription_id', ord.subscription_id);
  end if;
  update public.orders set status = 'paid' where id = ord.id;
  return jsonb_build_object('result', 'confirmed');
end $$;

-- Expira holds vencidos e cancela reservas não pagas (job periódico do worker).
create or replace function app.expire_holds() returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare n integer := 0; r record;
begin
  for r in select a.id, a.booking_id from public.capacity_allocations a where a.status = 'held' and a.expires_at <= now() for update skip locked loop
    update public.capacity_allocations set status = 'expired' where id = r.id;
    if exists (select 1 from public.bookings b where b.id = r.booking_id and b.status = 'awaiting_payment')
       and not exists (select 1 from public.orders o join public.payments p on p.order_id = o.id where o.booking_id = r.booking_id and p.status in ('confirmed','settled')) then
      update public.bookings set status = 'cancelled' where id = r.booking_id;
      update public.orders set status = 'expired' where booking_id = r.booking_id and status = 'awaiting_payment';
      update public.payments set status = 'expired' where order_id in (select id from public.orders where booking_id = r.booking_id) and status = 'pending';
      perform app.emit('CapacityExpired', 'booking', r.booking_id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Execução (check-in/out completos com evidências ficam para o incremento seguinte; aqui, só a progressão guardada).
create or replace function app.set_booking_status(p_booking uuid, p_to text) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare b record;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'booking_not_found' using errcode = 'no_data_found'; end if;
  if p_to in ('ready','in_progress','completed','interrupted','no_show') then
    if not app.is_org_member(b.organization_id) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  elsif p_to = 'cancelled' then
    if b.tutor_id <> app.uid() and not app.is_org_member(b.organization_id) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  else raise exception 'status_not_settable' using errcode = 'check_violation';
  end if;
  update public.bookings set status = p_to, completed_at = case when p_to = 'completed' then now() else completed_at end where id = p_booking;
  if p_to in ('cancelled','no_show') then update public.capacity_allocations set status = 'released' where booking_id = p_booking and status in ('held','allocated'); end if;
  perform app.emit('Booking' || initcap(p_to), 'booking', p_booking);
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'app.submit_profile(uuid)','app.review_profile(uuid,text,text)','app.create_request(uuid,tstzrange,text,uuid[])',
    'app.send_quote(uuid,jsonb,timestamptz,jsonb)','app.accept_quote(uuid,text)','app.set_booking_status(uuid,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to cuidope_app, cuidope_service', f);
  end loop;
  foreach f in array array[
    'app.register_payment(uuid,text,text,text,timestamptz)','app.record_webhook(text,text,text,text,jsonb)',
    'app.confirm_payment(text,text)','app.expire_holds()'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to cuidope_service', f);
  end loop;
end $$;
revoke all on function app.emit(text, text, uuid, jsonb) from public;   -- só chamado de dentro de funções SECURITY DEFINER
grant execute on function app.emit(text, text, uuid, jsonb) to cuidope_service;
