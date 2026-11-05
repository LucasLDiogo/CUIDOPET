-- 0003 — catálogo: regiões, espécies, categorias, prestadores, ofertas, recursos e agenda.

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  uf char(2) not null,
  city_ibge_id integer not null,             -- ID oficial do município (IBGE)
  name text not null,
  kind text not null check (kind in ('city','neighborhood')),
  parent_id uuid references public.regions(id),
  timezone text not null default 'America/Sao_Paulo',  -- IANA; Brasil não é uma só zona
  approx_lat numeric(6,2),                   -- centroide aproximado (2 casas ≈ 1 km); nunca endereço
  approx_lng numeric(6,2),
  unique (city_ibge_id, name, kind)
);
create index regions_uf_idx on public.regions (uf, kind);

create table public.species (
  code text primary key,
  label text not null,
  enabled_pilot boolean not null default false
);
insert into public.species values ('dog','Cachorro',true),('cat','Gato',true),('bird','Ave',false),('rabbit','Coelho',false);

create table public.service_categories (
  code text primary key,
  label text not null,
  mode text not null check (mode in ('capacity_nights','capacity_day','time_slot','professional_slot'))
);
insert into public.service_categories values
  ('hospedagem_domiciliar','Hospedagem domiciliar','capacity_nights'),
  ('creche_diurna','Creche diurna','capacity_day'),
  ('passeio','Passeio','time_slot'),
  ('visita_domicilio','Visita em domicílio','time_slot'),
  ('baba_pernoite','Babá / pernoite na casa do tutor','capacity_nights'),
  ('banho','Banho','professional_slot'),
  ('tosa','Tosa','professional_slot'),
  ('banho_tosa','Banho e tosa','professional_slot');

-- "Todos" = todas as combinações ativas; só aparece o que está habilitado na região.
create table public.region_enablement (
  region_id uuid not null references public.regions(id) on delete cascade,
  category_code text not null references public.service_categories(code),
  species_code text not null references public.species(code),
  enabled boolean not null default true,
  primary key (region_id, category_code, species_code)
);

create table public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  responsible_user_id uuid not null references public.users(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  public_name text not null check (length(public_name) between 2 and 80),
  bio text check (length(bio) <= 1200),
  photo_ref text,
  city_region_id uuid not null references public.regions(id),
  neighborhood_region_id uuid references public.regions(id),
  status text not null default 'draft' check (status in ('draft','submitted','reviewing','published','needs_changes','rejected','suspended','archived')),
  whatsapp_opt_in boolean not null default false,   -- exibição de canal só por ação explícita do prestador
  external_site_opt_in boolean not null default false,
  is_demo boolean not null default false,           -- dados fictícios visivelmente identificados
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)                      -- permite FK composta anti-cross-org
);
create index provider_profiles_published_idx on public.provider_profiles (city_region_id) where status = 'published';
create trigger provider_profiles_updated before update on public.provider_profiles for each row execute function app.set_updated_at();

-- Contatos profissionais: privados; só expostos por ação explícita (opt-in).
create table private.provider_contacts (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  professional_phone text,
  phone_confirmed_at timestamptz,
  external_site_url text check (external_site_url is null or external_site_url ~ '^https://'),
  commercial_address text
);

-- Métricas derivadas: gravadas só pelo servidor (jobs), nunca pelo cliente.
create table public.provider_metrics (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  rating_avg numeric(3,2) check (rating_avg between 1 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  response_rate numeric(4,3) not null default 0 check (response_rate between 0 and 1),
  cancellation_rate numeric(4,3) not null default 0 check (cancellation_rate between 0 and 1),
  completeness numeric(4,3) not null default 0 check (completeness between 0 and 1),
  updated_at timestamptz not null default now(),
  check ((rating_count = 0) = (rating_avg is null))   -- sem avaliação ⇒ sem nota (nunca inventar 5★)
);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  kind text not null check (kind in ('identity','safety_basic','safety_extended','venue_audit')),
  status text not null default 'not_started' check (status in ('not_started','pending','needs_information','approved','expired','rejected','revoked')),
  scope text,                        -- o que foi conferido (tooltip do selo)
  method text,
  valid_until timestamptz,
  reviewer_user_id uuid references public.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'approved' or (scope is not null and valid_until is not null))
);
create index verifications_provider_idx on public.verifications (provider_id, kind);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('person','place','equipment')),
  name text not null,
  capacity_units integer not null check (capacity_units > 0),
  timezone text not null default 'America/Sao_Paulo',
  unique (id, organization_id)
);

create table public.service_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_id uuid not null,
  resource_id uuid not null,       -- hospedar e passear compartilham o mesmo recurso/capacidade
  category_code text not null references public.service_categories(code),
  title text not null check (length(title) between 3 and 100),
  description text,
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  price_cents integer not null check (price_cents >= 0),
  price_unit text not null check (price_unit in ('night','day','hour','walk','visit','service')),
  price_is_from boolean not null default false,
  price_variation_note text,
  duration_minutes integer check (duration_minutes > 0),
  execution_place text not null check (execution_place in ('provider_home','tutor_home','establishment')),
  accepted_sizes text[] not null default '{small,medium,large}',
  units_per_pet integer not null default 1 check (units_per_pet > 0),
  cancellation_policy_version text not null default 'cancel-v1',
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (provider_id, organization_id) references public.provider_profiles(id, organization_id) on delete cascade,
  foreign key (resource_id, organization_id) references public.resources(id, organization_id),   -- impede vincular recurso de outra organização
  check (not price_is_from or price_variation_note is not null)   -- "a partir de" precisa explicar a variação
);
create index service_listings_pub_idx on public.service_listings (category_code, provider_id) where status = 'published';
create trigger service_listings_updated before update on public.service_listings for each row execute function app.set_updated_at();

create table public.listing_species (
  listing_id uuid not null references public.service_listings(id) on delete cascade,
  species_code text not null references public.species(code),
  primary key (listing_id, species_code)
);

create table public.service_areas (
  listing_id uuid not null references public.service_listings(id) on delete cascade,
  region_id uuid not null references public.regions(id),
  radius_km integer check (radius_km > 0),
  primary key (listing_id, region_id)
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  check (end_time > start_time)
);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  period tstzrange not null check (not isempty(period)),
  capacity_units integer not null default 0 check (capacity_units >= 0),  -- 0 = bloqueio total
  reason text
);
create index availability_exceptions_idx on public.availability_exceptions using gist (resource_id, period);

-- Limite de ofertas por plano (verificado no banco, além do API).
create table public.plans (
  code text primary key,
  price_cents integer not null check (price_cents >= 0),
  max_listings integer not null check (max_listings > 0),
  detailed_analytics boolean not null,
  authorized_proposals boolean not null,
  regional_boost_credits integer not null default 0
);
insert into public.plans values
  ('essencial', 0, 2, false, false, 0),
  ('profissional', 3990, 10, true, true, 0),
  ('pro_regional', 7990, 10, true, true, 4);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_code text not null references public.plans(code),
  status text not null check (status in ('pending','active','past_due','suspended','cancel_at_period_end','cancelled')),
  channel text not null default 'web' check (channel in ('web','ios','android')),
  provider_ref text,
  current_period_end timestamptz,
  grace_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscriptions_one_live_uq on public.subscriptions (organization_id) where status in ('pending','active','past_due','suspended','cancel_at_period_end');

create or replace function app.enforce_listing_limit() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare lim integer; cnt integer;
begin
  select coalesce((select p.max_listings from public.subscriptions s join public.plans p on p.code = s.plan_code
                    where s.organization_id = new.organization_id
                      and (s.status = 'active' or (s.status = 'cancel_at_period_end' and s.current_period_end > now())
                           or (s.status = 'past_due' and s.grace_until > now()))
                    limit 1),
                  (select max_listings from public.plans where code = 'essencial')) into lim;
  select count(*) into cnt from public.service_listings where organization_id = new.organization_id and status <> 'archived' and id <> new.id;
  if new.status <> 'archived' and cnt >= lim then
    raise exception 'listing_limit_reached: plano permite % ofertas', lim using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger service_listings_limit before insert or update of status on public.service_listings
  for each row execute function app.enforce_listing_limit();
