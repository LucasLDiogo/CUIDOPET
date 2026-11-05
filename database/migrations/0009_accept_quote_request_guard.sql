-- 0009 — Aceite de proposta só em pedido ainda em negociação.
-- Achado de QA: com o pedido recusado/cancelado/expirado a proposta continuava 'sent' e o aceite falhava tarde,
-- só ao atualizar o pedido (erro genérico de transição). A transação já desfazia tudo (sem dinheiro nem vaga presos),
-- mas a mensagem era confusa. Agora a regra é checada logo após travar o pedido, com erro específico.
-- Mantém assinatura e permissões da função (create or replace preserva o ACL definido na 0007).

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
  if r.status not in ('open','discussing','quoted') then raise exception 'request_closed: %', r.status using errcode = 'check_violation'; end if;
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
