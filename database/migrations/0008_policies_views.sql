-- 0008 — RLS, grants mínimos por coluna e projeções públicas. Princípio: negar por padrão.
-- A RLS soma-se à autorização da API; não a substitui (spec §19).

revoke all on all tables in schema public from public, cuidope_anon, cuidope_app;
revoke all on all tables in schema private from public, cuidope_anon, cuidope_app;
revoke all on all functions in schema app from public;
revoke all on all sequences in schema public from public;

-- Funções que NUNCA podem ser chamadas pelo cliente
revoke all on function app.refresh_provider_metrics(uuid), app.audit(text, text, uuid, text) from public, cuidope_app;
grant execute on function app.refresh_provider_metrics(uuid), app.audit(text, text, uuid, text) to cuidope_service;
-- Funções de autorização e protocolos
grant execute on function app.uid(), app.new_protocol(text) to cuidope_app, cuidope_service;
grant usage on sequence public.protocol_seq to cuidope_app, cuidope_service;

-- Defaults que dependem da sessão (cliente nunca informa o próprio id)
alter table public.messages alter column sender_id set default app.uid();
alter table public.user_blocks alter column blocker_id set default app.uid();
alter table public.tickets alter column requester_id set default app.uid();
alter table public.reports alter column reporter_id set default app.uid();
alter table public.reviews alter column reviewer_id set default app.uid();
alter table public.consent_records alter column user_id set default app.uid();
alter table public.pets alter column tutor_id set default app.uid();

create or replace function app.is_blocked_between(conv uuid) returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.conversation_participants cp join public.user_blocks ub
                   on (ub.blocker_id = cp.user_id and ub.blocked_id = app.uid()) or (ub.blocker_id = app.uid() and ub.blocked_id = cp.user_id)
                  where cp.conversation_id = conv)
$$;
revoke all on function app.is_blocked_between(uuid) from public;
grant execute on function app.is_blocked_between(uuid) to cuidope_app, cuidope_service;

-- Serviço (worker/webhooks): acesso total controlado por código do servidor.
grant all on all tables in schema public to cuidope_service;
grant all on all tables in schema private to cuidope_service;
grant all on all sequences in schema public to cuidope_service;

-- ── Dados de referência (leitura pública) ───────────────────────────────────
grant select on public.regions, public.species, public.service_categories, public.region_enablement, public.plans to cuidope_anon, cuidope_app;

-- ── Habilitar RLS em tudo que contém dado de negócio ────────────────────────
do $$ declare t text; begin
  foreach t in array array[
    'users','user_roles','organizations','memberships','provider_profiles','provider_metrics','verifications','resources',
    'service_listings','listing_species','service_areas','availability_rules','availability_exceptions','subscriptions',
    'pets','service_requests','request_pets','quotes','quote_items','bookings','booking_pets','capacity_allocations',
    'orders','order_lines','payments','webhook_inbox','outbox','idempotency_keys','ledger_transactions','ledger_entries',
    'reviews','consent_records','authorized_leads','conversations','conversation_participants','messages','user_blocks',
    'tickets','reports','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    -- O papel de serviço (worker/webhooks) opera com RLS ativa porém liberada por política explícita:
    -- portável para Postgres gerenciado (sem exigir BYPASSRLS/superuser).
    execute format('create policy service_all on public.%I for all to cuidope_service using (true) with check (true)', t);
  end loop;
  foreach t in array array['user_contacts','private_identities','provider_contacts','pet_care_plans'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('create policy service_all on private.%I for all to cuidope_service using (true) with check (true)', t);
  end loop;
end $$;

-- ── users / roles ───────────────────────────────────────────────────────────
grant select on public.users to cuidope_app;
grant update (display_name, photo_ref, locale) on public.users to cuidope_app;
create policy users_select on public.users for select to cuidope_app using (
  id = app.uid() or exists (select 1 from public.conversation_participants a join public.conversation_participants b on a.conversation_id = b.conversation_id
                             where a.user_id = users.id and b.user_id = app.uid()));
create policy users_update on public.users for update to cuidope_app using (id = app.uid()) with check (id = app.uid());

grant select on public.user_roles to cuidope_app;
create policy roles_select on public.user_roles for select to cuidope_app using (user_id = app.uid());

grant select on private.user_contacts to cuidope_app;
create policy contacts_select on private.user_contacts for select to cuidope_app using (user_id = app.uid());

-- ── organizações ────────────────────────────────────────────────────────────
grant select on public.organizations to cuidope_app;
grant insert (owner_user_id, kind, display_name) on public.organizations to cuidope_app;
grant update (display_name) on public.organizations to cuidope_app;
create policy org_select on public.organizations for select to cuidope_app using (owner_user_id = app.uid() or app.is_org_member(id));
create policy org_insert on public.organizations for insert to cuidope_app with check (owner_user_id = app.uid());
create policy org_update on public.organizations for update to cuidope_app using (owner_user_id = app.uid()) with check (owner_user_id = app.uid());

grant select on public.memberships to cuidope_app;
grant insert (organization_id, user_id, member_role) on public.memberships to cuidope_app;
grant update (status) on public.memberships to cuidope_app;
create policy mem_select on public.memberships for select to cuidope_app using (user_id = app.uid() or app.is_org_member(organization_id));
create policy mem_insert on public.memberships for insert to cuidope_app with check (
  exists (select 1 from public.organizations o where o.id = organization_id and o.owner_user_id = app.uid()));
create policy mem_update on public.memberships for update to cuidope_app using (
  exists (select 1 from public.organizations o where o.id = organization_id and o.owner_user_id = app.uid()));

-- ── prestador ───────────────────────────────────────────────────────────────
grant select on public.provider_profiles to cuidope_app;
grant insert (organization_id, responsible_user_id, slug, public_name, bio, photo_ref, city_region_id, neighborhood_region_id) on public.provider_profiles to cuidope_app;
grant update (public_name, bio, photo_ref, city_region_id, neighborhood_region_id, whatsapp_opt_in, external_site_opt_in) on public.provider_profiles to cuidope_app;
create policy pp_select on public.provider_profiles for select to cuidope_app using (app.is_org_member(organization_id) or app.has_role('trust_safety'));
create policy pp_insert on public.provider_profiles for insert to cuidope_app with check (app.is_org_member(organization_id) and responsible_user_id = app.uid());
create policy pp_update on public.provider_profiles for update to cuidope_app using (app.is_org_member(organization_id)) with check (app.is_org_member(organization_id));

grant select, insert, update on private.provider_contacts to cuidope_app;
create policy pc_all on private.provider_contacts for all to cuidope_app using (app.is_provider_member(provider_id)) with check (app.is_provider_member(provider_id));

grant select on public.verifications to cuidope_app;
create policy ver_select on public.verifications for select to cuidope_app using (app.is_provider_member(provider_id) or app.has_role('trust_safety'));

grant select, insert, update, delete on public.resources to cuidope_app;
create policy res_all on public.resources for all to cuidope_app using (app.is_org_member(organization_id)) with check (app.is_org_member(organization_id));

grant select, insert, update on public.service_listings to cuidope_app;
create policy sl_select on public.service_listings for select to cuidope_app using (app.is_org_member(organization_id));
create policy sl_insert on public.service_listings for insert to cuidope_app with check (
  app.is_org_member(organization_id) and (status <> 'published' or exists (select 1 from public.provider_profiles pp where pp.id = provider_id and pp.status = 'published')));
create policy sl_update on public.service_listings for update to cuidope_app using (app.is_org_member(organization_id)) with check (
  app.is_org_member(organization_id) and (status <> 'published' or exists (select 1 from public.provider_profiles pp where pp.id = provider_id and pp.status = 'published')));

grant select, insert, delete on public.listing_species, public.service_areas to cuidope_app;
create policy ls_all on public.listing_species for all to cuidope_app using (exists (select 1 from public.service_listings l where l.id = listing_id)) with check (exists (select 1 from public.service_listings l where l.id = listing_id));
create policy sa_all on public.service_areas for all to cuidope_app using (exists (select 1 from public.service_listings l where l.id = listing_id)) with check (exists (select 1 from public.service_listings l where l.id = listing_id));

grant select, insert, update, delete on public.availability_rules, public.availability_exceptions to cuidope_app;
create policy ar_all on public.availability_rules for all to cuidope_app using (exists (select 1 from public.resources r where r.id = resource_id)) with check (exists (select 1 from public.resources r where r.id = resource_id));
create policy ae_all on public.availability_exceptions for all to cuidope_app using (exists (select 1 from public.resources r where r.id = resource_id)) with check (exists (select 1 from public.resources r where r.id = resource_id));

grant select on public.subscriptions to cuidope_app;
create policy sub_select on public.subscriptions for select to cuidope_app using (app.is_org_member(organization_id));

-- ── tutor / pets ────────────────────────────────────────────────────────────
grant select on public.pets to cuidope_app;
grant insert (name, species_code, breed, size, age_band, photo_ref) on public.pets to cuidope_app;
grant update (name, breed, size, age_band, photo_ref, archived_at) on public.pets to cuidope_app;
create policy pets_select on public.pets for select to cuidope_app using (tutor_id = app.uid());
create policy pets_insert on public.pets for insert to cuidope_app with check (tutor_id = app.uid());
create policy pets_update on public.pets for update to cuidope_app using (tutor_id = app.uid()) with check (tutor_id = app.uid());

grant select, insert, update on private.pet_care_plans to cuidope_app;
create policy care_all on private.pet_care_plans for all to cuidope_app
  using (exists (select 1 from public.pets p where p.id = pet_id and p.tutor_id = app.uid()))
  with check (exists (select 1 from public.pets p where p.id = pet_id and p.tutor_id = app.uid()));

-- ── solicitações, propostas, reservas ───────────────────────────────────────
grant select on public.service_requests, public.request_pets, public.quotes, public.quote_items to cuidope_app;
create policy sr_select on public.service_requests for select to cuidope_app using (tutor_id = app.uid() or app.is_provider_member(provider_id));
create policy rp_select on public.request_pets for select to cuidope_app using (exists (select 1 from public.service_requests r where r.id = request_id));
create policy q_select on public.quotes for select to cuidope_app using (
  exists (select 1 from public.service_requests r where r.id = request_id and (app.is_provider_member(r.provider_id) or (r.tutor_id = app.uid() and quotes.status <> 'draft'))));
create policy qi_select on public.quote_items for select to cuidope_app using (exists (select 1 from public.quotes q where q.id = quote_id));

grant select on public.bookings, public.booking_pets, public.capacity_allocations to cuidope_app;
create policy b_select on public.bookings for select to cuidope_app using (tutor_id = app.uid() or app.is_org_member(organization_id));
-- Detalhes do pet só chegam ao prestador após a reserva confirmada (minimização, spec §6).
create policy bp_select on public.booking_pets for select to cuidope_app using (exists (
  select 1 from public.bookings b where b.id = booking_id and
    (b.tutor_id = app.uid() or (app.is_org_member(b.organization_id) and b.status in ('confirmed','ready','in_progress','interrupted','completed')))));
create policy ca_select on public.capacity_allocations for select to cuidope_app using (exists (select 1 from public.bookings b where b.id = booking_id and app.is_org_member(b.organization_id)));

grant select on public.orders, public.order_lines, public.payments to cuidope_app;
create policy o_select on public.orders for select to cuidope_app using (buyer_id = app.uid());
create policy ol_select on public.order_lines for select to cuidope_app using (exists (select 1 from public.orders o where o.id = order_id));
create policy pay_select on public.payments for select to cuidope_app using (exists (select 1 from public.orders o where o.id = order_id));

-- Mudança de estado da solicitação (recusar / conversar / cancelar), com guarda de transição no trigger.
create or replace function app.set_request_status(p_request uuid, p_to text, p_reason text default null) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r record;
begin
  select * into r from public.service_requests where id = p_request for update;
  if not found then raise exception 'request_not_found' using errcode = 'no_data_found'; end if;
  if p_to = 'cancelled' then
    if r.tutor_id <> app.uid() then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  elsif p_to in ('discussing','declined') then
    if not app.is_provider_member(r.provider_id) then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  else raise exception 'status_not_settable' using errcode = 'check_violation';
  end if;
  update public.service_requests set status = p_to, decline_reason = case when p_to = 'declined' then p_reason else decline_reason end where id = p_request;
end $$;
revoke all on function app.set_request_status(uuid, text, text) from public;
grant execute on function app.set_request_status(uuid, text, text) to cuidope_app, cuidope_service;

-- ── avaliações ──────────────────────────────────────────────────────────────
grant select on public.reviews to cuidope_app;
grant insert (booking_id, provider_id, score_communication, score_punctuality, score_care, score_match, comment) on public.reviews to cuidope_app;
grant update (provider_reply) on public.reviews to cuidope_app;
create policy rev_select on public.reviews for select to cuidope_app using (moderation_status = 'published' or reviewer_id = app.uid() or app.is_provider_member(provider_id));
create policy rev_insert on public.reviews for insert to cuidope_app with check (reviewer_id = app.uid());
create policy rev_reply on public.reviews for update to cuidope_app using (app.is_provider_member(provider_id)) with check (app.is_provider_member(provider_id));

-- ── consentimento / leads ───────────────────────────────────────────────────
grant select on public.consent_records to cuidope_app;
grant insert (user_id, purpose, channel, target_provider_id, target_listing_id, text_version, text_snapshot, expires_at) on public.consent_records to cuidope_app;
grant update (status, revoked_at) on public.consent_records to cuidope_app;
create policy cr_select on public.consent_records for select to cuidope_app using (user_id = app.uid());
create policy cr_insert on public.consent_records for insert to cuidope_app with check (user_id = app.uid());
create policy cr_revoke on public.consent_records for update to cuidope_app using (user_id = app.uid()) with check (user_id = app.uid() and status = 'revoked');
grant select on public.authorized_leads to cuidope_app;
create policy al_select on public.authorized_leads for select to cuidope_app using (tutor_id = app.uid() or app.is_provider_member(provider_id));

-- ── chat ────────────────────────────────────────────────────────────────────
grant select on public.conversations, public.conversation_participants, public.messages to cuidope_app;
grant insert (conversation_id, body, attachment_ref) on public.messages to cuidope_app;
create policy conv_select on public.conversations for select to cuidope_app using (app.is_participant(id));
create policy cp_select on public.conversation_participants for select to cuidope_app using (app.is_participant(conversation_id));
create policy msg_select on public.messages for select to cuidope_app using (app.is_participant(conversation_id) and status = 'sent');
create policy msg_insert on public.messages for insert to cuidope_app with check (sender_id = app.uid() and app.is_participant(conversation_id) and not app.is_blocked_between(conversation_id));

grant select, insert, delete on public.user_blocks to cuidope_app;
create policy ub_all on public.user_blocks for all to cuidope_app using (blocker_id = app.uid()) with check (blocker_id = app.uid());

-- ── suporte / denúncias / auditoria ─────────────────────────────────────────
grant select on public.tickets to cuidope_app;
grant insert (booking_id, category, subject, body) on public.tickets to cuidope_app;
create policy t_select on public.tickets for select to cuidope_app using (requester_id = app.uid() or app.has_role('support'));
create policy t_insert on public.tickets for insert to cuidope_app with check (requester_id = app.uid());
grant select on public.reports to cuidope_app;
grant insert (subject_type, subject_id, reason) on public.reports to cuidope_app;
create policy r_select on public.reports for select to cuidope_app using (reporter_id = app.uid() or app.has_role('trust_safety'));
create policy r_insert on public.reports for insert to cuidope_app with check (reporter_id = app.uid());
grant select on public.audit_logs to cuidope_app;
create policy audit_select on public.audit_logs for select to cuidope_app using (app.has_role('admin') or app.has_role('support'));

-- ── Projeções públicas (executam com os privilégios do dono: só colunas seguras) ─
create view public.v_public_providers with (security_barrier) as
select p.id, p.slug, p.public_name, p.bio, p.photo_ref,
       c.id as city_region_id, c.uf, c.name as city_name, n.id as neighborhood_region_id, n.name as neighborhood_name,
       coalesce(n.approx_lat, c.approx_lat) as area_lat, coalesce(n.approx_lng, c.approx_lng) as area_lng,   -- centroide APROXIMADO da área; nunca endereço
       m.rating_avg, coalesce(m.rating_count, 0) as rating_count, coalesce(m.response_rate, 0) as response_rate, coalesce(m.completeness, 0) as completeness,
       exists (select 1 from public.verifications v where v.provider_id = p.id and v.kind = 'identity' and v.status = 'approved' and v.valid_until > now()) as identity_verified,
       (select v.scope from public.verifications v where v.provider_id = p.id and v.kind = 'identity' and v.status = 'approved' and v.valid_until > now() limit 1) as identity_scope,
       exists (select 1 from public.subscriptions s where s.organization_id = p.organization_id and s.plan_code in ('profissional','pro_regional')
               and (s.status = 'active' or (s.status = 'cancel_at_period_end' and s.current_period_end > now()) or (s.status = 'past_due' and s.grace_until > now()))) as is_professional,
       p.whatsapp_opt_in as whatsapp_available, p.external_site_opt_in as external_site_available,
       p.is_demo, p.published_at
  from public.provider_profiles p
  join public.regions c on c.id = p.city_region_id
  left join public.regions n on n.id = p.neighborhood_region_id
  left join public.provider_metrics m on m.provider_id = p.id
 where p.status = 'published';

create view public.v_public_listings with (security_barrier) as
select l.id, l.provider_id, l.category_code, l.title, l.description, l.price_cents, l.price_unit, l.price_is_from, l.price_variation_note,
       l.duration_minutes, l.execution_place, l.accepted_sizes,
       pr.city_region_id,
       coalesce((select array_agg(ls.species_code order by ls.species_code) from public.listing_species ls
                  join public.species s on s.code = ls.species_code and s.enabled_pilot
                  join public.region_enablement re on re.region_id = pr.city_region_id and re.category_code = l.category_code and re.species_code = ls.species_code and re.enabled
                 where ls.listing_id = l.id), '{}') as species
  from public.service_listings l
  join public.provider_profiles pr on pr.id = l.provider_id and pr.status = 'published'
 where l.status = 'published';

create view public.v_public_reviews with (security_barrier) as
select r.id, r.provider_id, r.score_communication, r.score_punctuality, r.score_care, r.score_match, r.comment, r.label, r.provider_reply, r.created_at
  from public.reviews r join public.provider_profiles pr on pr.id = r.provider_id and pr.status = 'published'
 where r.moderation_status = 'published';

grant select on public.v_public_providers, public.v_public_listings, public.v_public_reviews to cuidope_anon, cuidope_app;

-- Capacidade disponível (sem lock) para filtrar busca por datas; devolve apenas booleano.
create or replace function public.listing_has_capacity(p_listing uuid, p_period tstzrange, p_units integer default 1) returns boolean
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare cap integer; eff integer; used integer; l record;
begin
  select l2.resource_id, l2.units_per_pet into l from public.service_listings l2 where l2.id = p_listing and l2.status = 'published';
  if not found then return false; end if;
  select capacity_units into cap from public.resources where id = l.resource_id;
  select least(cap, coalesce(min(capacity_units), cap)) into eff from public.availability_exceptions where resource_id = l.resource_id and period && p_period;
  select coalesce(sum(units), 0) into used from public.capacity_allocations
   where resource_id = l.resource_id and period && p_period and (status = 'allocated' or (status = 'held' and expires_at > now()));
  return used + (p_units * l.units_per_pet) <= eff;
end $$;
revoke all on function public.listing_has_capacity(uuid, tstzrange, integer) from public;
grant execute on function public.listing_has_capacity(uuid, tstzrange, integer) to cuidope_anon, cuidope_app, cuidope_service;
