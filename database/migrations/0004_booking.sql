-- 0004 — pets, solicitações, propostas versionadas, reservas, capacidade (hold/alocação).

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.users(id) on delete restrict,
  name text not null check (length(name) between 1 and 60),
  species_code text not null references public.species(code),
  breed text,
  size text not null check (size in ('small','medium','large')),
  age_band text check (age_band in ('puppy','adult','senior')),
  photo_ref text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index pets_tutor_idx on public.pets (tutor_id) where archived_at is null;

-- Dados detalhados do cuidado: privados do tutor. O prestador só recebe SNAPSHOT após reserva (booking_pets).
create table private.pet_care_plans (
  pet_id uuid not null references public.pets(id) on delete cascade,
  version integer not null,
  routine text,
  feeding text,
  restrictions text,
  behavior text,
  emergency_contact text,
  vet_name text,
  created_at timestamptz not null default now(),
  primary key (pet_id, version)
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(id) on delete restrict,
  listing_id uuid not null references public.service_listings(id) on delete restrict,
  period tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  message text check (length(message) <= 2000),
  status text not null default 'open' check (status in ('open','discussing','quoted','accepted','declined','expired','cancelled')),
  decline_reason text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_requests_tutor_idx on public.service_requests (tutor_id, status);
create index service_requests_provider_idx on public.service_requests (provider_id, status);
create trigger service_requests_updated before update on public.service_requests for each row execute function app.set_updated_at();

create table public.request_pets (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete restrict,
  need_snapshot jsonb not null default '{}',   -- resumo minimizado (espécie, porte); sem dados sensíveis
  primary key (request_id, pet_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','sent','accepted','revised','expired','rejected')),
  total_cents integer not null check (total_cents > 0),
  valid_until timestamptz not null,
  policy_snapshot jsonb not null,               -- cancelamento, regras, local, deslocamento
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique (request_id, version)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents = quantity * unit_price_cents)
);

-- total da proposta = soma dos itens (verificado ao enviar)
create or replace function app.check_quote_total() returns trigger language plpgsql as $$
declare s bigint;
begin
  if new.status = 'sent' and (old.status is distinct from 'sent') then
    select coalesce(sum(total_cents), 0) into s from public.quote_items where quote_id = new.id;
    if s <> new.total_cents then raise exception 'quote_total_mismatch: itens somam % e total é %', s, new.total_cents using errcode = 'check_violation'; end if;
  end if;
  return new;
end $$;
create trigger quotes_total before update of status on public.quotes for each row execute function app.check_quote_total();

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  accepted_quote_id uuid not null unique references public.quotes(id) on delete restrict,
  tutor_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  listing_id uuid not null references public.service_listings(id) on delete restrict,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','confirmed','ready','in_progress','completed','cancelled','no_show','interrupted')),
  timezone text not null,
  period tstzrange not null,
  total_cents integer not null check (total_cents > 0),
  commission_bps integer not null check (commission_bps between 0 and 10000),  -- snapshot da taxa
  policy_snapshot jsonb not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_tutor_idx on public.bookings (tutor_id, status);
create index bookings_provider_idx on public.bookings (organization_id, status);
create trigger bookings_updated before update on public.bookings for each row execute function app.set_updated_at();

create table public.booking_pets (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete restrict,
  care_plan_snapshot jsonb not null default '{}',
  capacity_units integer not null check (capacity_units > 0),
  primary key (booking_id, pet_id)
);

create table public.capacity_allocations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete restrict,
  period tstzrange not null check (not isempty(period)),
  units integer not null check (units > 0),
  status text not null default 'held' check (status in ('held','allocated','released','expired')),
  expires_at timestamptz,
  exclusive_slot boolean not null default false,
  created_at timestamptz not null default now(),
  check (status <> 'held' or expires_at is not null),
  -- Defesa em profundidade sob concorrência real: recurso de capacidade 1 nunca sobrepõe períodos ativos.
  constraint capacity_no_overlap_exclusive exclude using gist (resource_id with =, period with &&)
    where (exclusive_slot and status in ('held','allocated'))
);
create index capacity_allocations_res_idx on public.capacity_allocations using gist (resource_id, period) where status in ('held','allocated');
create unique index capacity_one_active_per_booking on public.capacity_allocations (booking_id) where status in ('held','allocated');

-- Reserva de capacidade: lock da linha do recurso serializa concorrentes; soma conservadora (nunca vende demais).
create or replace function app.reserve_capacity(p_booking uuid, p_resource uuid, p_period tstzrange, p_units integer, p_ttl interval)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare cap integer; eff integer; used integer; alloc uuid;
begin
  select capacity_units into cap from public.resources where id = p_resource for update;
  if cap is null then raise exception 'resource_not_found' using errcode = 'no_data_found'; end if;

  update public.capacity_allocations set status = 'expired'
   where resource_id = p_resource and status = 'held' and expires_at <= now();

  select least(cap, coalesce(min(capacity_units), cap)) into eff
    from public.availability_exceptions where resource_id = p_resource and period && p_period;

  select coalesce(sum(units), 0) into used from public.capacity_allocations
   where resource_id = p_resource and status in ('held','allocated') and period && p_period;

  if used + p_units > eff then
    raise exception 'capacity_unavailable: usado %, pedido %, capacidade %', used, p_units, eff using errcode = 'check_violation';
  end if;

  insert into public.capacity_allocations(booking_id, resource_id, period, units, status, expires_at, exclusive_slot)
  values (p_booking, p_resource, p_period, p_units, 'held', now() + p_ttl, cap = 1 and p_units = 1)
  returning id into alloc;
  return alloc;
end $$;
revoke all on function app.reserve_capacity(uuid, uuid, tstzrange, integer, interval) from public;
grant execute on function app.reserve_capacity(uuid, uuid, tstzrange, integer, interval) to cuidope_service;
