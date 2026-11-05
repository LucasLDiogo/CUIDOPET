-- =====================================================================================
-- Cuidopê — marketplace de cuidado pet
-- Migration inicial: schema, RLS (deny by default), funções seguras, triggers, storage.
--
-- Convenções:
--   * snake_case no banco; o adaptador do front mapeia para camelCase (apps/web/src/domain/types.ts).
--   * Dinheiro: integer em CENTAVOS com CHECK >= 0.
--   * Datas: timestamptz (UTC). Fuso de negócio: America/Sao_Paulo.
--   * Telefones: E.164 brasileiro  ^\+55[1-9]{2}9?[0-9]{8}$  (mesma regra de toE164 em rules.ts).
--   * Erros de negócio: SQLSTATE próprios (o adaptador converte em AppError):
--       CP401 nao_autenticado · CP403 proibido · CP404 nao_encontrado · CP409 conflito · CP422 invalido
--   * Escritas sensíveis (status, preço, nota, saldo de pacote) SOMENTE por funções SECURITY DEFINER
--     com search_path = '' e nomes totalmente qualificados.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists app;
comment on schema app is 'Helpers internos do Cuidopê (não exposto pelo PostgREST).';
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- Utilitários
-- -------------------------------------------------------------------------------------

-- Lança erro de negócio com SQLSTATE próprio.
create or replace function app.fail(p_code text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = p_code, message = p_message;
end;
$$;

-- true durante o seed (permite inserir dados históricos sem disparar efeitos colaterais).
-- Nunca é verdadeiro para anon/authenticated (eles não executam SQL arbitrário, e a checagem de role reforça).
create or replace function app.is_seeding()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('cuidope.seeding', true), '') = 'on'
     and current_user not in ('anon', 'authenticated');
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Comissão em basis points, half-up (igual a commissionCents em rules.ts).
create or replace function app.commission_cents(p_total integer, p_bps integer default 1200)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ((p_total::bigint * p_bps + 5000) / 10000)::integer;
$$;

create or replace function app.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(p_text, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- Preenche {{variavel}} num corpo de template.
create or replace function app.fill_template(p_body text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text := p_body;
  v_key text;
  v_val text;
begin
  for v_key, v_val in select key, value from jsonb_each_text(p_vars) loop
    v_out := replace(v_out, '{{' || v_key || '}}', coalesce(v_val, ''));
  end loop;
  return v_out;
end;
$$;

create sequence if not exists app.booking_code_seq start with 40000;

-- =====================================================================================
-- Tabelas
-- =====================================================================================

create table public.categories (
  id text primary key check (id in ('passeio','pet_sitter','hospedagem','creche','banho_tosa','petshop','adestramento','vet_domicilio')),
  label text not null check (char_length(label) between 1 and 60),
  short text not null check (char_length(short) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  sort_order integer not null default 0
);

create table public.cities (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80),
  uf char(2) not null check (uf ~ '^[A-Z]{2}$'),
  ibge integer not null unique check (ibge > 0),
  neighborhoods text[] not null default '{}',
  center_lat numeric(9,6) not null check (center_lat between -90 and 90),
  center_lng numeric(9,6) not null check (center_lng between -180 and 180)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'tutor' check (role in ('tutor','prestador')),
  full_name text not null default '' check (char_length(full_name) <= 120),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  owner_user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  kind text not null check (kind in ('autonomo','empresa')),
  tagline text not null default '' check (char_length(tagline) <= 160),
  bio text not null default '' check (char_length(bio) <= 2000),
  categories text[] not null check (
    cardinality(categories) between 1 and 8
    and categories <@ array['passeio','pet_sitter','hospedagem','creche','banho_tosa','petshop','adestramento','vet_domicilio']::text[]),
  city_id text not null references public.cities(id),
  neighborhood text not null default '' check (char_length(neighborhood) <= 80),
  -- coordenadas APROXIMADAS (bairro, 3 casas decimais ≈ 100 m), nunca o endereço exato
  geo_lat numeric(7,3) check (geo_lat between -90 and 90),
  geo_lng numeric(7,3) check (geo_lng between -180 and 180),
  avatar_seed integer not null default 0,
  cover_seed integer not null default 0,
  rating numeric(3,2) check (rating between 1 and 5),       -- null = sem avaliações (nunca 5★ inventado)
  review_count integer not null default 0 check (review_count >= 0),
  rating_breakdown integer[] not null default '{0,0,0,0,0}' check (cardinality(rating_breakdown) = 5),
  response_time_min integer not null default 60 check (response_time_min >= 0),
  response_rate numeric(4,3) not null default 0 check (response_rate between 0 and 1),
  verified_identity boolean not null default false,
  verified_background boolean not null default false,
  verified_venue boolean not null default false,
  years_experience integer not null default 0 check (years_experience between 0 and 80),
  pets_served integer not null default 0 check (pets_served >= 0),
  species text[] not null default '{cao,gato}' check (cardinality(species) >= 1 and species <@ array['cao','gato']::text[]),
  sizes text[] not null default '{mini,pequeno,medio,grande,gigante}' check (cardinality(sizes) >= 1 and sizes <@ array['mini','pequeno','medio','grande','gigante']::text[]),
  price_from_cents integer not null default 0 check (price_from_cents >= 0),
  whatsapp_opt_in boolean not null default false,
  -- DERIVADO por trigger: só tem valor quando whatsapp_opt_in = true (fonte: provider_settings.wa_number)
  whatsapp_public text check (whatsapp_public ~ '^\+55[1-9]{2}9?[0-9]{8}$'),
  opening_hours jsonb not null default '[]' check (jsonb_typeof(opening_hours) = 'array' and jsonb_array_length(opening_hours) <= 7),
  amenities text[] not null default '{}' check (cardinality(amenities) <= 30),
  cancellation_policy text not null default 'flexivel' check (cancellation_policy in ('flexivel','moderada','rigida')),
  plan text not null default 'essencial' check (plan in ('essencial','profissional','pro')),
  featured boolean not null default false,
  status text not null default 'rascunho' check (status in ('rascunho','em_analise','publicado','suspenso')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_whatsapp_requires_opt_in check (whatsapp_public is null or whatsapp_opt_in)
);

create table public.provider_settings (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  wa_number text check (wa_number ~ '^\+55[1-9]{2}9?[0-9]{8}$'),
  wa_phone_number_id text check (wa_phone_number_id ~ '^[0-9]{5,30}$'),   -- id do número na Meta (roteamento do webhook)
  wa_provider text not null default 'desconectado' check (wa_provider in ('cloud_api','z_api','evolution','desconectado')),
  wa_connected boolean not null default false,                             -- controlado pelo servidor
  auto_confirmation_request boolean not null default true,
  reminder_24h boolean not null default true,
  reminder_2h boolean not null default false,
  post_service_review boolean not null default true,
  reactivation_days integer not null default 30 check (reactivation_days between 1 and 365),
  first_response_sla_min integer not null default 15 check (first_response_sla_min between 1 and 1440),
  auto_reply_outside_hours boolean not null default false,
  instant_booking boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index provider_settings_wa_phone_number_id_key on public.provider_settings (wa_phone_number_id) where wa_phone_number_id is not null;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  category text not null references public.categories(id),
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  price_cents integer not null check (price_cents >= 0 and price_cents <= 10000000),
  unit text not null check (unit in ('passeio','hora','diaria','servico','visita','mes')),
  duration_min integer not null check (duration_min between 5 and 44640),
  species text[] not null default '{cao,gato}' check (cardinality(species) >= 1 and species <@ array['cao','gato']::text[]),
  sizes text[] not null default '{mini,pequeno,medio,grande,gigante}' check (cardinality(sizes) >= 1 and sizes <@ array['mini','pequeno','medio','grande','gigante']::text[]),
  capacity_units integer not null check (capacity_units between 1 and 200),  -- pets simultâneos; default por categoria (trigger)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  sessions integer not null check (sessions between 1 and 365),
  price_cents integer not null check (price_cents >= 0 and price_cents <= 100000000),
  full_price_cents integer not null default 0 check (full_price_cents >= 0),  -- calculado (sessions × preço do serviço)
  validity_days integer not null check (validity_days between 1 and 730),
  active boolean not null default true,
  popular boolean not null default false,
  sold_count integer not null default 0 check (sold_count >= 0),             -- controlado pelo servidor
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,  -- null = contato só de CRM (sem login)
  name text not null check (char_length(name) between 1 and 120),
  phone text check (phone ~ '^\+55[1-9]{2}9?[0-9]{8}$'),
  email text check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  city_id text references public.cities(id),
  neighborhood text not null default '' check (char_length(neighborhood) <= 80),
  wa_opt_in boolean not null default false,          -- consentimento: mensagens TRANSACIONAIS no WhatsApp
  wa_opt_in_at timestamptz,
  marketing_opt_in boolean not null default false,   -- consentimento SEPARADO: ofertas/reativação
  marketing_opt_in_at timestamptz,
  is_demo boolean not null default false,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- vínculo prestador ↔ cliente (base do CRM e da RLS do lado do prestador)
create table public.provider_customers (
  provider_id uuid not null references public.providers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  source text not null default 'app' check (source in ('app','whatsapp','balcao','manual')),
  created_at timestamptz not null default now(),
  primary key (provider_id, customer_id)
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.customers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  species text not null check (species in ('cao','gato')),
  breed text not null default '' check (char_length(breed) <= 80),
  size text not null check (size in ('mini','pequeno','medio','grande','gigante')),
  birth_year integer check (birth_year between 1990 and 2100),
  weight_kg numeric(5,2) check (weight_kg > 0 and weight_kg < 150),
  temperament text not null default '' check (char_length(temperament) <= 500),
  care_notes text not null default '' check (char_length(care_notes) <= 1000),
  vaccines_up_to_date boolean not null default false,
  avatar_seed integer not null default 0,
  photo_path text check (char_length(photo_path) <= 300),   -- objeto no bucket privado pet-photos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.package_purchases (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.service_packages(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  sessions_total integer not null check (sessions_total >= 1),
  sessions_used integer not null default 0,
  price_cents integer not null check (price_cents >= 0),
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'ativo' check (status in ('ativo','esgotado','expirado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint package_purchases_saldo check (sessions_used between 0 and sessions_total),
  constraint package_purchases_validade check (expires_at > purchased_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('CP-' || nextval('app.booking_code_seq')) check (code ~ '^CP-[0-9]{4,10}$'),
  provider_id uuid not null references public.providers(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  package_purchase_id uuid references public.package_purchases(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  price_cents integer not null check (price_cents >= 0),
  commission_cents integer not null default 0 check (commission_cents >= 0),
  status text not null default 'pendente' check (status in ('pendente','aguardando_cliente','confirmado','em_atendimento','concluido','cancelado','recusado','nao_compareceu')),
  channel text not null default 'app' check (channel in ('app','whatsapp','balcao')),
  notes text not null default '' check (char_length(notes) <= 1000),
  location text not null default 'local_prestador' check (location in ('casa_tutor','local_prestador','busca_e_entrega')),
  wa_confirmation_sent_at timestamptz,
  wa_confirmation_replied_at timestamptz,
  wa_confirmation_reply text check (wa_confirmation_reply in ('SIM','NAO','REMARCAR')),
  reviewed boolean not null default false,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_periodo check (end_at > start_at)
);

create table public.booking_pets (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  primary key (booking_id, pet_id)
);

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  at timestamptz not null default now(),
  type text not null check (type in ('pendente','aguardando_cliente','confirmado','em_atendimento','concluido','cancelado','recusado','nao_compareceu','mensagem','lembrete','avaliacao','criado','remarcado')),
  label text not null check (char_length(label) <= 300),
  by_actor text not null check (by_actor in ('tutor','prestador','sistema','whatsapp'))
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  booking_id uuid unique references public.bookings(id) on delete set null,   -- 1 avaliação por reserva
  author_name text not null check (char_length(author_name) between 1 and 60),  -- nome + inicial (minimização)
  pet_name text not null default '' check (char_length(pet_name) <= 60),
  pet_species text not null default 'cao' check (pet_species in ('cao','gato')),
  service_name text not null default '' check (char_length(service_name) <= 120),
  rating smallint not null check (rating between 1 and 5),
  aspect_pontualidade smallint not null check (aspect_pontualidade between 1 and 5),
  aspect_cuidado smallint not null check (aspect_cuidado between 1 and 5),
  aspect_comunicacao smallint not null check (aspect_comunicacao between 1 and 5),
  text text not null default '' check (char_length(text) <= 2000),
  verified_booking boolean not null default false,
  reply_text text check (char_length(reply_text) between 1 and 1000),
  reply_at timestamptz,
  status text not null default 'publicada' check (status in ('publicada','oculta')),  -- moderação
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.favorites (
  customer_id uuid not null references public.customers(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, provider_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  phone text not null check (phone ~ '^\+55[1-9]{2}9?[0-9]{8}$'),
  status text not null default 'novo' check (status in ('novo','aguardando_atendimento','aguardando_cliente','agendado','resolvido')),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  unread integer not null default 0 check (unread >= 0),
  last_message_at timestamptz not null default now(),
  last_message_preview text not null default '' check (char_length(last_message_preview) <= 120),
  last_inbound_at timestamptz,          -- última mensagem do cliente (janela de 24 h da Meta)
  booking_id uuid references public.bookings(id) on delete set null,
  sla_due_at timestamptz,               -- prazo de primeira resposta
  first_response_at timestamptz,
  assigned_to text check (char_length(assigned_to) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, phone)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,  -- denormalizado (RLS + filtro realtime)
  from_actor text not null check (from_actor in ('cliente','prestador','bot','sistema')),
  text text not null check (char_length(text) <= 4096),
  at timestamptz not null default now(),
  delivery text not null default 'enviando' check (delivery in ('enviando','enviado','entregue','lido','falhou')),
  template text check (template ~ '^[a-z0-9_]+$' and char_length(template) <= 512),
  buttons text[] check (cardinality(buttons) <= 10),
  wa_message_id text unique check (char_length(wa_message_id) <= 255),
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now()
);

create table public.wa_templates (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete cascade,  -- null = template global da plataforma
  name text not null check (name ~ '^[a-z0-9_]+$' and char_length(name) <= 512),
  title text not null check (char_length(title) between 1 and 80),
  category text not null check (category in ('utility','marketing')),
  body text not null check (char_length(body) <= 1024),
  buttons text[] not null default '{}' check (cardinality(buttons) <= 10),
  language text not null default 'pt_BR' check (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index wa_templates_scope_name_key on public.wa_templates (coalesce(provider_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- idempotência do webhook (somente service_role)
create table public.wa_webhook_events (
  id text primary key check (char_length(id) <= 300),   -- wamid (mensagem) ou wamid:status
  kind text not null check (kind in ('message','status')),
  phone_number_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text check (char_length(result) <= 300)
);

-- tabela de transições (espelho de BOOKING_TRANSITIONS em rules.ts) + quem pode executar cada uma
create table app.booking_transitions (
  from_status text not null,
  to_status text not null,
  actors text[] not null,
  primary key (from_status, to_status)
);
insert into app.booking_transitions (from_status, to_status, actors) values
  ('pendente',           'aguardando_cliente', '{prestador}'),
  ('pendente',           'confirmado',         '{prestador,sistema}'),
  ('pendente',           'recusado',           '{prestador}'),
  ('pendente',           'cancelado',          '{tutor,prestador}'),
  ('aguardando_cliente', 'confirmado',         '{tutor,whatsapp,prestador}'),
  ('aguardando_cliente', 'cancelado',          '{tutor,whatsapp,prestador}'),
  ('aguardando_cliente', 'pendente',           '{tutor,whatsapp,prestador}'),
  ('confirmado',         'em_atendimento',     '{prestador}'),
  ('confirmado',         'cancelado',          '{tutor,prestador}'),
  ('confirmado',         'nao_compareceu',     '{prestador}'),
  ('em_atendimento',     'concluido',          '{prestador}');

-- =====================================================================================
-- Índices (FKs + colunas de busca)
-- =====================================================================================
create index providers_owner_user_id_idx on public.providers (owner_user_id);
create index providers_city_status_idx on public.providers (city_id, status);
create index providers_categories_gin on public.providers using gin (categories);
create index providers_status_featured_idx on public.providers (status, featured);
create index providers_name_trgm on public.providers using gin (name extensions.gin_trgm_ops);
create index services_provider_id_idx on public.services (provider_id);
create index services_category_idx on public.services (category);
create index service_packages_provider_id_idx on public.service_packages (provider_id);
create index service_packages_service_id_idx on public.service_packages (service_id);
create index customers_phone_idx on public.customers (phone);
create index customers_city_id_idx on public.customers (city_id);
create index provider_customers_customer_id_idx on public.provider_customers (customer_id);
create index pets_owner_id_idx on public.pets (owner_id);
create index package_purchases_package_id_idx on public.package_purchases (package_id);
create index package_purchases_provider_id_idx on public.package_purchases (provider_id);
create index package_purchases_customer_id_idx on public.package_purchases (customer_id);
create index bookings_provider_start_idx on public.bookings (provider_id, start_at);
create index bookings_customer_start_idx on public.bookings (customer_id, start_at);
create index bookings_service_id_idx on public.bookings (service_id);
create index bookings_package_purchase_id_idx on public.bookings (package_purchase_id);
create index bookings_status_idx on public.bookings (provider_id, status);
create index booking_pets_pet_id_idx on public.booking_pets (pet_id);
create index booking_events_booking_id_idx on public.booking_events (booking_id, at);
create index reviews_provider_created_idx on public.reviews (provider_id, created_at desc);
create index favorites_provider_id_idx on public.favorites (provider_id);
create index conversations_provider_last_idx on public.conversations (provider_id, last_message_at desc);
create index conversations_customer_id_idx on public.conversations (customer_id);
create index conversations_booking_id_idx on public.conversations (booking_id);
create index messages_conversation_at_idx on public.messages (conversation_id, at);
create index messages_provider_at_idx on public.messages (provider_id, at);
create index wa_templates_provider_id_idx on public.wa_templates (provider_id);
create index cities_uf_idx on public.cities (uf);

-- =====================================================================================
-- Helpers de autorização (SECURITY DEFINER: evitam recursão/custo de RLS em cascata)
-- =====================================================================================
create or replace function app.my_provider_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.providers p where p.owner_user_id = (select auth.uid());
$$;

create or replace function app.my_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.customers c where c.user_id = (select auth.uid());
$$;

-- clientes vinculados aos prestadores do usuário atual
create or replace function app.my_provider_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pc.customer_id
    from public.provider_customers pc
    join public.providers p on p.id = pc.provider_id
   where p.owner_user_id = (select auth.uid());
$$;

create or replace function app.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v uuid := auth.uid();
begin
  if v is null then perform app.fail('CP401', 'faça login para continuar'); end if;
  return v;
end;
$$;

create or replace function app.require_my_customer()
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare c public.customers;
begin
  select * into c from public.customers where user_id = app.require_uid();
  if not found then perform app.fail('CP404', 'perfil de tutor não encontrado'); end if;
  return c;
end;
$$;

create or replace function app.require_provider_owner(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.providers p where p.id = p_provider_id and p.owner_user_id = app.require_uid()) then
    perform app.fail('CP403', 'você não administra este prestador');
  end if;
end;
$$;

-- =====================================================================================
-- Triggers de domínio
-- =====================================================================================

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['profiles','providers','provider_settings','services','service_packages','customers','pets',
                           'package_purchases','bookings','reviews','conversations','wa_templates'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- novo usuário em auth.users → profile (+ customer de tutor)
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(coalesce(new.email, ''), '@', 1), 'Tutor'), 120);
  -- papel NUNCA vem de raw_user_meta_data (editável pelo usuário). Só app_metadata (servidor) pode marcar prestador.
  v_role text := case when new.raw_app_meta_data->>'cuidope_role' = 'prestador' then 'prestador' else 'tutor' end;
begin
  insert into public.profiles (id, role, full_name) values (new.id, v_role, v_name)
  on conflict (id) do nothing;
  -- o seed cria os customers demo explicitamente
  if coalesce(new.raw_app_meta_data->>'cuidope_seed', 'false') <> 'true' then
    insert into public.customers (user_id, name, email)
    values (new.id, v_name, case when new.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(new.email) end)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- whatsapp_public só existe com opt-in (fonte: provider_settings.wa_number)
create or replace function app.providers_sync_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.whatsapp_opt_in then
    new.whatsapp_public := null;
  elsif tg_op = 'UPDATE' or new.whatsapp_public is null then
    new.whatsapp_public := coalesce((select s.wa_number from public.provider_settings s where s.provider_id = new.id), new.whatsapp_public);
  end if;
  return new;
end;
$$;
create trigger providers_sync_whatsapp before insert or update of whatsapp_opt_in, whatsapp_public on public.providers
  for each row execute function app.providers_sync_whatsapp();

create or replace function app.settings_sync_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_seeding() then return new; end if;
  update public.providers p
     set whatsapp_public = case when p.whatsapp_opt_in then new.wa_number end
   where p.id = new.provider_id;
  return new;
end;
$$;
create trigger provider_settings_sync_whatsapp after insert or update of wa_number on public.provider_settings
  for each row execute function app.settings_sync_whatsapp();

-- capacidade padrão por categoria (mesma tabela CAPACITY de rules.ts)
create or replace function app.services_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.capacity_units is null then
    new.capacity_units := case new.category
      when 'hospedagem' then 6 when 'creche' then 12 when 'passeio' then 2 when 'pet_sitter' then 1
      when 'banho_tosa' then 3 when 'petshop' then 3 when 'adestramento' then 1 when 'vet_domicilio' then 1 else 1 end;
  end if;
  return new;
end;
$$;
create trigger services_defaults before insert on public.services for each row execute function app.services_defaults();

-- preço "a partir de" do prestador acompanha os serviços ativos
create or replace function app.services_refresh_price_from()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_pid uuid := coalesce(new.provider_id, old.provider_id);
begin
  if app.is_seeding() then return null; end if;
  update public.providers p
     set price_from_cents = coalesce((select min(s.price_cents) from public.services s where s.provider_id = v_pid and s.active), 0)
   where p.id = v_pid;
  if tg_op = 'UPDATE' and new.price_cents is distinct from old.price_cents then
    update public.service_packages sp set full_price_cents = new.price_cents * sp.sessions where sp.service_id = new.id;
  end if;
  return null;
end;
$$;
create trigger services_refresh_price_from after insert or update of price_cents, active or delete on public.services
  for each row execute function app.services_refresh_price_from();

-- pacote: serviço precisa ser do mesmo prestador; preço cheio calculado no servidor
create or replace function app.packages_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_svc public.services;
begin
  select * into v_svc from public.services where id = new.service_id;
  if not found or v_svc.provider_id <> new.provider_id then
    perform app.fail('CP422', 'o serviço do pacote precisa ser do mesmo prestador');
  end if;
  if not app.is_seeding() then
    new.full_price_cents := v_svc.price_cents * new.sessions;
  end if;
  -- sold_count/provider_id/full_price_cents não constam nos GRANTs de coluna: o cliente não consegue alterá-los.
  return new;
end;
$$;
create trigger service_packages_validate before insert or update on public.service_packages
  for each row execute function app.packages_validate();

create or replace function app.purchases_count_sold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_seeding() then return null; end if;
  update public.service_packages set sold_count = sold_count + 1 where id = new.package_id;
  return null;
end;
$$;
create trigger package_purchases_count_sold after insert on public.package_purchases
  for each row execute function app.purchases_count_sold();

-- consentimentos com data (LGPD: prova de consentimento)
create or replace function app.customers_consent_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.wa_opt_in and new.wa_opt_in_at is null then new.wa_opt_in_at := now(); end if;
    if new.marketing_opt_in and new.marketing_opt_in_at is null then new.marketing_opt_in_at := now(); end if;
  else
    if new.wa_opt_in is distinct from old.wa_opt_in then new.wa_opt_in_at := now(); end if;
    if new.marketing_opt_in is distinct from old.marketing_opt_in then new.marketing_opt_in_at := now(); end if;
    -- user_id não consta no GRANT de update: o vínculo com o login é imutável para o cliente.
  end if;
  return new;
end;
$$;
create trigger customers_consent_dates before insert or update on public.customers
  for each row execute function app.customers_consent_dates();

-- nota do prestador recalculada a partir das avaliações publicadas
create or replace function app.recalc_provider_rating(p_provider_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.providers p
     set review_count = agg.n,
         rating = case when agg.n = 0 then null else round(agg.avg_rating, 2) end,
         rating_breakdown = array[agg.r1, agg.r2, agg.r3, agg.r4, agg.r5]
    from (
      select count(*)::int as n, avg(r.rating)::numeric as avg_rating,
             count(*) filter (where r.rating = 1)::int as r1, count(*) filter (where r.rating = 2)::int as r2,
             count(*) filter (where r.rating = 3)::int as r3, count(*) filter (where r.rating = 4)::int as r4,
             count(*) filter (where r.rating = 5)::int as r5
        from public.reviews r
       where r.provider_id = p_provider_id and r.status = 'publicada'
    ) agg
   where p.id = p_provider_id;
$$;

create or replace function app.reviews_recalc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_seeding() then return null; end if;
  if tg_op in ('INSERT','UPDATE') then perform app.recalc_provider_rating(new.provider_id); end if;
  if tg_op in ('DELETE','UPDATE') and (tg_op = 'DELETE' or old.provider_id <> new.provider_id) then
    perform app.recalc_provider_rating(old.provider_id);
  end if;
  return null;
end;
$$;
create trigger reviews_recalc after insert or delete or update of rating, status, provider_id on public.reviews
  for each row execute function app.reviews_recalc();

-- mensagens: provider_id denormalizado + estado da conversa (CRM / SLA)
create or replace function app.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.provider_id into new.provider_id from public.conversations c where c.id = new.conversation_id;
  if new.provider_id is null then perform app.fail('CP404', 'conversa não encontrada'); end if;
  return new;
end;
$$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function app.messages_before_insert();

create or replace function app.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_sla integer;
begin
  if app.is_seeding() then return null; end if;
  select coalesce(s.first_response_sla_min, 15) into v_sla
    from public.conversations c left join public.provider_settings s on s.provider_id = c.provider_id
   where c.id = new.conversation_id;

  update public.conversations c set
    last_message_at = greatest(c.last_message_at, new.at),
    last_message_preview = left(new.text, 120),
    unread = case when new.from_actor = 'cliente' then c.unread + 1 else c.unread end,
    last_inbound_at = case when new.from_actor = 'cliente' then new.at else c.last_inbound_at end,
    status = case
      when new.from_actor = 'cliente' and c.status <> 'novo' then 'aguardando_atendimento'
      when new.from_actor = 'prestador' and c.status in ('novo','aguardando_atendimento') then 'aguardando_cliente'
      else c.status end,
    sla_due_at = case
      when new.from_actor = 'cliente' then coalesce(c.sla_due_at, new.at + make_interval(mins => v_sla))
      when new.from_actor = 'prestador' then null
      else c.sla_due_at end,
    first_response_at = case when new.from_actor = 'prestador' then coalesce(c.first_response_at, new.at) else c.first_response_at end
  where c.id = new.conversation_id;
  return null;
end;
$$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function app.messages_after_insert();

-- =====================================================================================
-- Lógica de reservas (interna)
-- =====================================================================================

-- preço calculado no servidor. Regra: categorias "por pet" multiplicam pela qtd de pets.
create or replace function app.booking_price(p_service public.services, p_pet_count integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select p_service.price_cents * case when p_service.category in ('hospedagem','creche','banho_tosa') then greatest(1, p_pet_count) else 1 end;
$$;

-- horário dentro do funcionamento (fuso America/Sao_Paulo)
create or replace function app.within_opening_hours(p_hours jsonb, p_start timestamptz, p_duration_min integer)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_start at time zone 'America/Sao_Paulo';
  v_dow integer := extract(dow from v_local)::int;
  v_min integer := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_h jsonb;
  v_open integer; v_close integer;
begin
  if p_hours is null or jsonb_array_length(p_hours) = 0 then return true; end if;   -- sem grade = livre
  for v_h in select value from jsonb_array_elements(p_hours) loop
    if (v_h->>'day')::int = v_dow then
      v_open := split_part(v_h->>'open', ':', 1)::int * 60 + split_part(v_h->>'open', ':', 2)::int;
      v_close := split_part(v_h->>'close', ':', 1)::int * 60 + split_part(v_h->>'close', ':', 2)::int;
      return v_min >= v_open and v_min + least(p_duration_min, 120) <= v_close;
    end if;
  end loop;
  return false;
end;
$$;

-- valida horário e capacidade (com lock para evitar overbooking concorrente)
create or replace function app.assert_slot(p_service public.services, p_start timestamptz, p_end timestamptz, p_units integer, p_ignore_booking uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.providers;
  v_used integer;
begin
  select * into v_provider from public.providers where id = p_service.provider_id;
  if not app.within_opening_hours(v_provider.opening_hours, p_start, p_service.duration_min) then
    perform app.fail('CP422', 'horário fora do funcionamento do prestador');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_service.provider_id::text || ':' || p_service.category, 0));
  select coalesce(sum(greatest(1, (select count(*) from public.booking_pets bp where bp.booking_id = b.id))), 0)::int
    into v_used
    from public.bookings b
    join public.services s on s.id = b.service_id
   where b.provider_id = p_service.provider_id
     and s.category = p_service.category
     and b.status in ('pendente','aguardando_cliente','confirmado','em_atendimento')
     and b.start_at < p_end and b.end_at > p_start
     and (p_ignore_booking is null or b.id <> p_ignore_booking);
  if v_used + greatest(1, p_units) > p_service.capacity_units then
    perform app.fail('CP409', 'sem vaga nesse horário — escolha outro');
  end if;
end;
$$;

create or replace function app.validate_pets(p_customer_id uuid, p_service public.services, p_pet_ids uuid[], p_min integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if coalesce(cardinality(p_pet_ids), 0) < p_min or coalesce(cardinality(p_pet_ids), 0) > 5 then
    perform app.fail('CP422', 'selecione de 1 a 5 pets');
  end if;
  if cardinality(p_pet_ids) = 0 then return; end if;
  select count(*) into v_count from public.pets where id = any(p_pet_ids) and owner_id = p_customer_id;
  if v_count <> (select count(distinct x) from unnest(p_pet_ids) x) then
    perform app.fail('CP403', 'pet não pertence a este tutor');
  end if;
  if exists (select 1 from public.pets where id = any(p_pet_ids) and not (species = any(p_service.species))) then
    perform app.fail('CP422', 'este serviço não atende a espécie do pet');
  end if;
  if exists (select 1 from public.pets where id = any(p_pet_ids) and not (size = any(p_service.sizes))) then
    perform app.fail('CP422', 'este serviço não atende o porte do pet');
  end if;
end;
$$;

create or replace function app.ensure_conversation(p_provider_id uuid, p_customer_id uuid, p_phone text, p_booking_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.conversations (provider_id, customer_id, phone, booking_id)
  values (p_provider_id, p_customer_id, p_phone, p_booking_id)
  on conflict (provider_id, phone) do update
     set customer_id = excluded.customer_id,
         booking_id = coalesce(excluded.booking_id, public.conversations.booking_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.template_vars(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nome', split_part(c.name, ' ', 1),
    'pet', coalesce((select string_agg(pt.name, ' e ' order by pt.name) from public.booking_pets bp join public.pets pt on pt.id = bp.pet_id where bp.booking_id = b.id), 'seu pet'),
    'servico', s.name,
    'data', to_char(b.start_at at time zone 'America/Sao_Paulo', 'DD/MM'),
    'hora', to_char(b.start_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
    'prestador', p.name,
    'codigo', b.code)
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.services s on s.id = b.service_id
  join public.providers p on p.id = b.provider_id
  where b.id = p_booking_id;
$$;

-- registra mensagem do sistema/bot na conversa do cliente com o prestador (se houver telefone)
create or replace function app.log_conversation_message(p_booking_id uuid, p_from text, p_text text, p_template text default null, p_buttons text[] default null, p_delivery text default 'enviado')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_phone text;
  v_conv uuid;
  v_msg uuid;
begin
  select * into b from public.bookings where id = p_booking_id;
  select phone into v_phone from public.customers where id = b.customer_id;
  if v_phone is null then return null; end if;
  v_conv := app.ensure_conversation(b.provider_id, b.customer_id, v_phone, b.id);
  insert into public.messages (conversation_id, provider_id, from_actor, text, template, buttons, delivery)
  values (v_conv, b.provider_id, p_from, left(p_text, 4096), p_template, p_buttons, p_delivery)
  returning id into v_msg;
  return v_msg;
end;
$$;

-- transição de status validada pela tabela app.booking_transitions
create or replace function app.transition_booking(p_booking_id uuid, p_to text, p_actor text, p_note text default null, p_reply text default null)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_from text;
  v_actors text[];
  v_label text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then perform app.fail('CP404', 'reserva não encontrada'); end if;
  v_from := b.status;
  select t.actors into v_actors from app.booking_transitions t where t.from_status = v_from and t.to_status = p_to;
  if v_actors is null then
    perform app.fail('CP409', format('transição não permitida: %s → %s', v_from, p_to));
  end if;
  if not (p_actor = any(v_actors)) then
    perform app.fail('CP403', format('%s não pode mudar a reserva de %s para %s', p_actor, v_from, p_to));
  end if;

  update public.bookings set
    status = p_to,
    wa_confirmation_sent_at = case when p_to = 'aguardando_cliente' then now() else wa_confirmation_sent_at end,
    wa_confirmation_replied_at = case when p_to = 'aguardando_cliente' then null
                                      when v_from = 'aguardando_cliente' and p_reply is not null then now()
                                      else wa_confirmation_replied_at end,
    wa_confirmation_reply = case when p_to = 'aguardando_cliente' then null
                                 when v_from = 'aguardando_cliente' and p_reply is not null then p_reply
                                 else wa_confirmation_reply end,
    cancel_reason = case when p_to in ('cancelado','recusado') then nullif(left(coalesce(p_note, ''), 500), '') else cancel_reason end
  where id = b.id
  returning * into b;

  -- devolve a sessão do pacote quando a reserva não acontece por decisão das partes
  if p_to in ('cancelado','recusado') and b.package_purchase_id is not null then
    update public.package_purchases
       set sessions_used = greatest(sessions_used - 1, 0),
           status = case when status = 'esgotado' and expires_at > now() then 'ativo' else status end
     where id = b.package_purchase_id;
  end if;

  v_label := case
    when p_to = 'aguardando_cliente' then 'Aceito pelo prestador — confirmação enviada no WhatsApp'
    when p_to = 'confirmado' and p_actor = 'whatsapp' then 'Tutor respondeu ' || coalesce(p_reply, 'SIM') || ' no WhatsApp'
    when p_to = 'confirmado' and p_actor = 'tutor' then 'Tutor confirmou pelo app'
    when p_to = 'confirmado' then 'Confirmado pelo prestador'
    when p_to = 'pendente' then 'Tutor pediu para remarcar'
    when p_to = 'em_atendimento' then 'Check-in do pet'
    when p_to = 'concluido' then 'Atendimento concluído'
    when p_to = 'cancelado' then 'Cancelado pelo ' || case p_actor when 'prestador' then 'prestador' else 'tutor' end
    when p_to = 'recusado' then 'Recusado pelo prestador'
    when p_to = 'nao_compareceu' then 'Pet não compareceu'
    else p_to end;
  if nullif(p_note, '') is not null then v_label := left(v_label || ': ' || p_note, 300); end if;
  insert into public.booking_events (booking_id, type, label, by_actor) values (b.id, p_to, v_label, p_actor);

  -- efeitos no CRM
  if p_to = 'aguardando_cliente' then
    update public.conversations set status = 'aguardando_cliente', booking_id = b.id
     where provider_id = b.provider_id and customer_id = b.customer_id;
  elsif p_to = 'confirmado' then
    update public.conversations set status = 'agendado'
     where provider_id = b.provider_id and customer_id = b.customer_id;
    if p_actor in ('whatsapp','tutor') then
      perform app.log_conversation_message(b.id, 'sistema',
        'Agendamento ' || b.code || ' confirmado pelo cliente ' || case when p_actor = 'whatsapp' then 'via WhatsApp' else 'pelo app' end || ' ✓');
    end if;
  elsif p_to in ('cancelado','recusado') then
    perform app.log_conversation_message(b.id, 'sistema', 'Agendamento ' || b.code || ' ' || p_to || coalesce(' — ' || nullif(p_note, ''), ''));
  elsif p_to = 'pendente' and p_reply = 'REMARCAR' then
    update public.conversations set status = 'aguardando_atendimento', sla_due_at = coalesce(sla_due_at, now() + interval '15 minutes')
     where provider_id = b.provider_id and customer_id = b.customer_id;
  end if;
  return b;
end;
$$;

-- =====================================================================================
-- RPCs públicas (expostas pelo PostgREST; EXECUTE só para authenticated, salvo indicado)
-- =====================================================================================

create or replace function public.create_booking(
  p_provider_id uuid,
  p_service_id uuid,
  p_pet_ids uuid[],
  p_start timestamptz,
  p_notes text default '',
  p_location text default 'local_prestador',
  p_package_id uuid default null,
  p_package_purchase_id uuid default null,
  p_contact jsonb default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_provider public.providers;
  v_service public.services;
  v_settings public.provider_settings;
  v_pkg public.service_packages;
  v_purchase public.package_purchases;
  v_end timestamptz;
  v_price integer;
  v_status text;
  v_phone text;
  b public.bookings;
  v_tpl public.wa_templates;
  v_conv uuid;
begin
  v_customer := app.require_my_customer();

  -- dados de contato informados no checkout (validados pelas CHECKs da tabela)
  if p_contact is not null then
    v_phone := nullif(p_contact->>'phone', '');
    update public.customers set
      name = coalesce(nullif(left(trim(p_contact->>'name'), 120), ''), name),
      phone = coalesce(v_phone, phone),
      email = coalesce(nullif(lower(trim(p_contact->>'email')), ''), email),
      wa_opt_in = coalesce((p_contact->>'waOptIn')::boolean, wa_opt_in),
      marketing_opt_in = coalesce((p_contact->>'marketingOptIn')::boolean, marketing_opt_in)
    where id = v_customer.id
    returning * into v_customer;
  end if;
  if v_customer.phone is null then perform app.fail('CP422', 'informe um telefone válido (com DDD)'); end if;

  select * into v_provider from public.providers where id = p_provider_id and status = 'publicado';
  if not found then perform app.fail('CP404', 'prestador não encontrado'); end if;
  select * into v_service from public.services where id = p_service_id and provider_id = p_provider_id and active;
  if not found then perform app.fail('CP404', 'serviço indisponível'); end if;
  if p_location not in ('casa_tutor','local_prestador','busca_e_entrega') then perform app.fail('CP422', 'local inválido'); end if;
  if p_start is null or p_start <= now() then perform app.fail('CP422', 'escolha um horário futuro'); end if;
  if p_start > now() + interval '365 days' then perform app.fail('CP422', 'agendamentos até 12 meses à frente'); end if;
  if char_length(coalesce(p_notes, '')) > 1000 then perform app.fail('CP422', 'observações muito longas'); end if;

  perform app.validate_pets(v_customer.id, v_service, p_pet_ids);
  v_end := p_start + make_interval(mins => v_service.duration_min);
  perform app.assert_slot(v_service, p_start, v_end, cardinality(p_pet_ids));

  v_price := app.booking_price(v_service, cardinality(p_pet_ids));

  if p_package_purchase_id is not null then
    -- usar saldo de pacote
    select * into v_purchase from public.package_purchases where id = p_package_purchase_id for update;
    if not found or v_purchase.customer_id <> v_customer.id or v_purchase.provider_id <> p_provider_id then
      perform app.fail('CP403', 'pacote não pertence a você');
    end if;
    select * into v_pkg from public.service_packages where id = v_purchase.package_id;
    if v_pkg.service_id <> p_service_id then perform app.fail('CP422', 'este pacote é de outro serviço'); end if;
    if v_purchase.status <> 'ativo' or v_purchase.expires_at <= now() or v_purchase.sessions_used >= v_purchase.sessions_total then
      perform app.fail('CP409', 'pacote sem saldo ou vencido');
    end if;
    update public.package_purchases
       set sessions_used = sessions_used + 1,
           status = case when sessions_used + 1 >= sessions_total then 'esgotado' else 'ativo' end
     where id = v_purchase.id
     returning * into v_purchase;
    v_price := 0;
  elsif p_package_id is not null then
    -- comprar pacote junto (primeira sessão já consumida)
    select * into v_pkg from public.service_packages where id = p_package_id and provider_id = p_provider_id and active;
    if not found then perform app.fail('CP404', 'pacote indisponível'); end if;
    if v_pkg.service_id <> p_service_id then perform app.fail('CP422', 'este pacote é de outro serviço'); end if;
    insert into public.package_purchases (package_id, provider_id, customer_id, sessions_total, sessions_used, price_cents, expires_at, status)
    values (v_pkg.id, p_provider_id, v_customer.id, v_pkg.sessions, 1, v_pkg.price_cents, now() + make_interval(days => v_pkg.validity_days),
            case when v_pkg.sessions <= 1 then 'esgotado' else 'ativo' end)
    returning * into v_purchase;
    v_price := 0;   -- valor cobrado na compra do pacote
  end if;

  select * into v_settings from public.provider_settings where provider_id = p_provider_id;
  v_status := case when coalesce(v_settings.instant_booking, false) then 'confirmado' else 'pendente' end;

  insert into public.bookings (provider_id, customer_id, service_id, package_purchase_id, start_at, end_at, price_cents,
                               commission_cents, status, channel, notes, location)
  values (p_provider_id, v_customer.id, p_service_id, v_purchase.id, p_start, v_end, v_price,
          app.commission_cents(coalesce(case when p_package_id is not null then v_purchase.price_cents end, v_price)),
          v_status, 'app', coalesce(p_notes, ''), p_location)
  returning * into b;

  insert into public.booking_pets (booking_id, pet_id) select b.id, x from unnest(p_pet_ids) x group by x;
  insert into public.booking_events (booking_id, type, label, by_actor)
  values (b.id, 'criado', case when v_purchase.id is not null then 'Pedido criado pelo app (pacote)' else 'Pedido criado pelo app' end, 'tutor');
  if v_status = 'confirmado' then
    insert into public.booking_events (booking_id, type, label, by_actor) values (b.id, 'confirmado', 'Confirmado automaticamente (reserva instantânea)', 'sistema');
  end if;

  insert into public.provider_customers (provider_id, customer_id, source) values (p_provider_id, v_customer.id, 'app')
  on conflict do nothing;

  -- mensagem "pedido_recebido" (fica 'enviando' até o despachante do WhatsApp enviar)
  v_conv := app.ensure_conversation(p_provider_id, v_customer.id, v_customer.phone, b.id);
  select * into v_tpl from public.wa_templates t
   where t.name = 'pedido_recebido' and (t.provider_id = p_provider_id or t.provider_id is null)
   order by t.provider_id nulls last limit 1;
  insert into public.messages (conversation_id, provider_id, from_actor, text, template, delivery)
  values (v_conv, p_provider_id, 'bot',
          app.fill_template(coalesce(v_tpl.body, 'Recebemos seu pedido {{codigo}}.'), app.template_vars(b.id)),
          'pedido_recebido',
          case when v_customer.wa_opt_in then 'enviando' else 'falhou' end);
  update public.conversations
     set status = case when status in ('agendado','resolvido','novo') then 'aguardando_atendimento' else status end,
         sla_due_at = coalesce(sla_due_at, now() + make_interval(mins => coalesce(v_settings.first_response_sla_min, 15)))
   where id = v_conv;
  return b;
end;
$$;

create or replace function public.create_manual_booking(
  p_customer_id uuid,
  p_service_id uuid,
  p_pet_ids uuid[],
  p_start timestamptz,
  p_notes text default '',
  p_channel text default 'balcao'
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services;
  v_end timestamptz;
  b public.bookings;
begin
  select * into v_service from public.services where id = p_service_id;
  if not found then perform app.fail('CP404', 'serviço não encontrado'); end if;
  perform app.require_provider_owner(v_service.provider_id);
  if not exists (select 1 from public.provider_customers where provider_id = v_service.provider_id and customer_id = p_customer_id) then
    perform app.fail('CP403', 'cliente não pertence à sua carteira');
  end if;
  if p_channel not in ('app','whatsapp','balcao') then perform app.fail('CP422', 'canal inválido'); end if;
  if p_start is null or p_start < now() - interval '12 hours' then perform app.fail('CP422', 'horário inválido'); end if;
  perform app.validate_pets(p_customer_id, v_service, coalesce(p_pet_ids, '{}'), 0);
  v_end := p_start + make_interval(mins => v_service.duration_min);
  perform app.assert_slot(v_service, p_start, v_end, coalesce(cardinality(p_pet_ids), 0));

  insert into public.bookings (provider_id, customer_id, service_id, start_at, end_at, price_cents, commission_cents, status, channel, notes, location)
  values (v_service.provider_id, p_customer_id, v_service.id, p_start, v_end,
          app.booking_price(v_service, coalesce(cardinality(p_pet_ids), 0)),
          app.commission_cents(app.booking_price(v_service, coalesce(cardinality(p_pet_ids), 0))),
          'confirmado', p_channel, left(coalesce(p_notes, ''), 1000), 'local_prestador')
  returning * into b;
  insert into public.booking_pets (booking_id, pet_id) select b.id, x from unnest(coalesce(p_pet_ids, '{}')) x group by x;
  insert into public.booking_events (booking_id, type, label, by_actor) values
    (b.id, 'criado', 'Agendamento registrado pelo prestador (' || p_channel || ')', 'prestador'),
    (b.id, 'confirmado', 'Confirmado pelo prestador', 'prestador');
  return b;
end;
$$;

create or replace function public.update_booking_status(p_booking_id uuid, p_status text, p_note text default null)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare v_provider uuid;
begin
  select provider_id into v_provider from public.bookings where id = p_booking_id;
  if v_provider is null then perform app.fail('CP404', 'reserva não encontrada'); end if;
  perform app.require_provider_owner(v_provider);
  return app.transition_booking(p_booking_id, p_status, 'prestador', p_note);
end;
$$;

create or replace function public.cancel_my_booking(p_booking_id uuid, p_reason text default null)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer public.customers;
begin
  v_customer := app.require_my_customer();
  if not exists (select 1 from public.bookings where id = p_booking_id and customer_id = v_customer.id) then
    perform app.fail('CP404', 'reserva não encontrada');
  end if;
  return app.transition_booking(p_booking_id, 'cancelado', 'tutor', p_reason);
end;
$$;

create or replace function public.reply_confirmation(p_booking_id uuid, p_reply text)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_reply text := upper(trim(coalesce(p_reply, '')));
begin
  v_customer := app.require_my_customer();
  if not exists (select 1 from public.bookings where id = p_booking_id and customer_id = v_customer.id) then
    perform app.fail('CP404', 'reserva não encontrada');
  end if;
  if v_reply not in ('SIM','NAO','REMARCAR') then perform app.fail('CP422', 'resposta inválida'); end if;
  return app.transition_booking(p_booking_id,
    case v_reply when 'SIM' then 'confirmado' when 'NAO' then 'cancelado' else 'pendente' end,
    'tutor', case when v_reply = 'NAO' then 'tutor recusou a confirmação' end, v_reply);
end;
$$;

-- usado pelo webhook (service_role) quando o tutor toca Confirmar/Remarcar/Cancelar no WhatsApp
create or replace function public.wa_apply_confirmation(p_booking_id uuid, p_reply text)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare v_reply text := upper(trim(coalesce(p_reply, '')));
begin
  if v_reply not in ('SIM','NAO','REMARCAR') then perform app.fail('CP422', 'resposta inválida'); end if;
  return app.transition_booking(p_booking_id,
    case v_reply when 'SIM' then 'confirmado' when 'NAO' then 'cancelado' else 'pendente' end,
    'whatsapp', case when v_reply = 'NAO' then 'cancelado pelo tutor no WhatsApp' end, v_reply);
end;
$$;

create or replace function public.reschedule_booking(p_booking_id uuid, p_start timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_service public.services;
  v_end timestamptz;
  v_units integer;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then perform app.fail('CP404', 'reserva não encontrada'); end if;
  perform app.require_provider_owner(b.provider_id);
  if b.status not in ('pendente','aguardando_cliente','confirmado') then
    perform app.fail('CP409', 'só é possível remarcar reservas ainda não iniciadas');
  end if;
  if p_start is null or p_start <= now() then perform app.fail('CP422', 'escolha um horário futuro'); end if;
  select * into v_service from public.services where id = b.service_id;
  select count(*) into v_units from public.booking_pets where booking_id = b.id;
  v_end := p_start + (b.end_at - b.start_at);
  perform app.assert_slot(v_service, p_start, v_end, v_units, b.id);
  update public.bookings set start_at = p_start, end_at = v_end where id = b.id returning * into b;
  insert into public.booking_events (booking_id, type, label, by_actor)
  values (b.id, 'remarcado', 'Remarcado para ' || to_char(p_start at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'), 'prestador');
  return b;
end;
$$;

create or replace function public.submit_review(
  p_booking_id uuid,
  p_rating integer,
  p_pontualidade integer,
  p_cuidado integer,
  p_comunicacao integer,
  p_text text default ''
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  b public.bookings;
  v_service public.services;
  v_pet public.pets;
  v_author text;
  r public.reviews;
begin
  v_customer := app.require_my_customer();
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.customer_id <> v_customer.id then perform app.fail('CP404', 'reserva não encontrada'); end if;
  if b.status <> 'concluido' then perform app.fail('CP409', 'só é possível avaliar atendimentos concluídos'); end if;
  if b.reviewed or exists (select 1 from public.reviews where booking_id = b.id) then perform app.fail('CP409', 'esta reserva já foi avaliada'); end if;
  if now() > b.end_at + interval '14 days' then perform app.fail('CP409', 'o prazo para avaliar (14 dias) terminou'); end if;
  if p_rating not between 1 and 5 or p_pontualidade not between 1 and 5 or p_cuidado not between 1 and 5 or p_comunicacao not between 1 and 5 then
    perform app.fail('CP422', 'notas de 1 a 5');
  end if;
  if char_length(coalesce(p_text, '')) > 2000 then perform app.fail('CP422', 'texto muito longo'); end if;

  select * into v_service from public.services where id = b.service_id;
  select pt.* into v_pet from public.booking_pets bp join public.pets pt on pt.id = bp.pet_id where bp.booking_id = b.id order by pt.name limit 1;
  -- minimização: primeiro nome + inicial do último sobrenome
  v_author := case when position(' ' in trim(v_customer.name)) > 0
                   then split_part(trim(v_customer.name), ' ', 1) || ' ' || left(regexp_replace(trim(v_customer.name), '^.*\s', ''), 1) || '.'
                   else trim(v_customer.name) end;

  insert into public.reviews (provider_id, booking_id, author_name, pet_name, pet_species, service_name, rating,
                              aspect_pontualidade, aspect_cuidado, aspect_comunicacao, text, verified_booking)
  values (b.provider_id, b.id, left(v_author, 60), coalesce(v_pet.name, ''), coalesce(v_pet.species, 'cao'), coalesce(v_service.name, ''),
          p_rating, p_pontualidade, p_cuidado, p_comunicacao, coalesce(trim(p_text), ''), true)
  returning * into r;
  update public.bookings set reviewed = true where id = b.id;
  insert into public.booking_events (booking_id, type, label, by_actor) values (b.id, 'avaliacao', 'Tutor avaliou com ' || p_rating || '★', 'tutor');
  return r;
end;
$$;

create or replace function public.reply_review(p_review_id uuid, p_text text)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare r public.reviews;
begin
  select * into r from public.reviews where id = p_review_id for update;
  if not found then perform app.fail('CP404', 'avaliação não encontrada'); end if;
  perform app.require_provider_owner(r.provider_id);
  if char_length(trim(coalesce(p_text, ''))) not between 1 and 1000 then perform app.fail('CP422', 'resposta de 1 a 1000 caracteres'); end if;
  update public.reviews set reply_text = trim(p_text), reply_at = now() where id = r.id returning * into r;
  return r;
end;
$$;

create or replace function public.register_provider(
  p_name text,
  p_kind text,
  p_categories text[],
  p_city_id text,
  p_neighborhood text,
  p_phone text,
  p_email text,
  p_plan text default 'essencial'
)
returns public.providers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_uid();
  v_slug text;
  p public.providers;
begin
  if exists (select 1 from public.providers where owner_user_id = v_uid) then
    perform app.fail('CP409', 'você já possui um perfil de prestador');
  end if;
  if p_phone !~ '^\+55[1-9]{2}9?[0-9]{8}$' then perform app.fail('CP422', 'telefone inválido (use +55DDDNÚMERO)'); end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform app.fail('CP422', 'e-mail inválido'); end if;
  v_slug := left(app.slugify(p_name), 70);
  if v_slug = '' then perform app.fail('CP422', 'nome inválido'); end if;
  if exists (select 1 from public.providers where slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  end if;

  insert into public.providers (slug, owner_user_id, name, kind, categories, city_id, neighborhood, plan, status, species, sizes)
  values (v_slug, v_uid, trim(p_name), p_kind, p_categories, p_city_id, left(coalesce(p_neighborhood, ''), 80),
          coalesce(p_plan, 'essencial'), 'em_analise', '{cao,gato}', '{mini,pequeno,medio,grande,gigante}')
  returning * into p;
  insert into public.provider_settings (provider_id, wa_number) values (p.id, p_phone);
  update public.profiles set role = 'prestador' where id = v_uid;
  return p;
end;
$$;

-- ocupação (sem dados pessoais) para montar a grade de horários
create or replace function public.busy_slots(p_provider_id uuid, p_service_id uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz, units integer, capacity integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.start_at, b.end_at,
         greatest(1, (select count(*) from public.booking_pets bp where bp.booking_id = b.id))::int,
         s0.capacity_units
    from public.services s0
    join public.services s on s.provider_id = s0.provider_id and s.category = s0.category
    join public.bookings b on b.service_id = s.id
   where s0.id = p_service_id and s0.provider_id = p_provider_id
     and b.status in ('pendente','aguardando_cliente','confirmado','em_atendimento')
     and b.start_at < p_to and b.end_at > p_from
     and p_to - p_from <= interval '31 days';
$$;

-- números agregados da home (sem dados pessoais) — ÚNICA RPC liberada também para anon
create or replace function public.public_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'providers', (select count(*) from public.providers where status = 'publicado'),
    'reviews', (select count(*) from public.reviews r join public.providers p on p.id = r.provider_id where r.status = 'publicada' and p.status = 'publicado'),
    'avgRating', coalesce((select round(avg(rating), 2) from public.providers where status = 'publicado' and rating is not null), 0),
    'cities', (select count(distinct city_id) from public.providers where status = 'publicado'),
    'bookings', (select count(*) from public.bookings where status in ('confirmado','em_atendimento','concluido')));
$$;

-- LGPD: exclusão de conta do tutor (anonimiza o histórico necessário ao prestador/obrigações; apaga o resto)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := app.require_uid();
begin
  if exists (select 1 from public.providers where owner_user_id = v_uid and status = 'publicado') then
    perform app.fail('CP409', 'despublique seu perfil de prestador antes de excluir a conta');
  end if;
  delete from public.favorites where customer_id in (select id from public.customers where user_id = v_uid);
  delete from public.pets p where p.owner_id in (select id from public.customers where user_id = v_uid)
     and not exists (select 1 from public.booking_pets bp join public.bookings b on b.id = bp.booking_id
                      where bp.pet_id = p.id and b.status in ('pendente','aguardando_cliente','confirmado','em_atendimento'));
  update public.customers set name = 'Cliente removido', phone = null, email = null, neighborhood = '',
         wa_opt_in = false, marketing_opt_in = false, anonymized_at = now(), user_id = null
   where user_id = v_uid;
  update public.profiles set full_name = '', deleted_at = now() where id = v_uid;
  -- a remoção do registro em auth.users é feita pela Admin API (ver SECURITY.md)
end;
$$;

-- variáveis de template de uma reserva (usado pela edge function whatsapp-send; só service_role)
create or replace function public.wa_template_vars(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.template_vars(p_booking_id), '{}'::jsonb)
         || coalesce((select jsonb_build_object(
              'pacote', sp.name,
              'saldo', (pp.sessions_total - pp.sessions_used)::text,
              'validade', to_char(pp.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'))
            from public.bookings b
            join public.package_purchases pp on pp.id = b.package_purchase_id
            join public.service_packages sp on sp.id = pp.package_id
           where b.id = p_booking_id), '{}'::jsonb);
$$;

-- =====================================================================================
-- View pública de prestadores (security_invoker: respeita a RLS de quem consulta)
-- =====================================================================================
create view public.v_public_providers
with (security_invoker = true) as
select
  p.id, p.slug, p.name, p.kind, p.tagline, p.bio, p.categories, p.city_id,
  c.name as city_name, c.uf as city_uf,
  p.neighborhood, p.geo_lat, p.geo_lng, p.avatar_seed, p.cover_seed,
  p.rating, p.review_count, p.rating_breakdown, p.response_time_min, p.response_rate,
  p.verified_identity, p.verified_background, p.verified_venue,
  p.years_experience, p.pets_served, p.species, p.sizes, p.price_from_cents,
  p.whatsapp_opt_in,
  case when p.whatsapp_opt_in then p.whatsapp_public end as whatsapp_public,
  p.opening_hours, p.amenities, p.cancellation_policy, p.plan, p.featured, p.status, p.is_demo, p.created_at,
  exists (select 1 from public.service_packages sp where sp.provider_id = p.id and sp.active) as has_packages
from public.providers p
join public.cities c on c.id = p.city_id
where p.status = 'publicado';
comment on view public.v_public_providers is 'Catálogo público: só prestadores publicados, sem owner_user_id; WhatsApp só com opt-in.';

-- =====================================================================================
-- RLS — habilitada em TODAS as tabelas (deny by default)
-- =====================================================================================
do $$
declare t text;
begin
  foreach t in array array['categories','cities','profiles','providers','provider_settings','services','service_packages',
                           'customers','provider_customers','pets','package_purchases','bookings','booking_pets',
                           'booking_events','reviews','favorites','conversations','messages','wa_templates','wa_webhook_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
alter table app.booking_transitions enable row level security;
revoke all on table app.booking_transitions from public, anon, authenticated;

-- catálogo de referência
grant select on public.categories, public.cities to anon, authenticated;
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy cities_read on public.cities for select to anon, authenticated using (true);

-- profiles
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- providers: anon só por colunas públicas (sem owner_user_id); authenticated lê publicados + o próprio
grant select (id, slug, name, kind, tagline, bio, categories, city_id, neighborhood, geo_lat, geo_lng, avatar_seed, cover_seed,
              rating, review_count, rating_breakdown, response_time_min, response_rate, verified_identity, verified_background,
              verified_venue, years_experience, pets_served, species, sizes, price_from_cents, whatsapp_opt_in, whatsapp_public,
              opening_hours, amenities, cancellation_policy, plan, featured, status, is_demo, created_at, updated_at)
  on public.providers to anon;
grant select on public.providers to authenticated;
grant update (name, tagline, bio, neighborhood, amenities, opening_hours, whatsapp_opt_in, cancellation_policy, species, sizes)
  on public.providers to authenticated;
create policy providers_public_read on public.providers for select to anon, authenticated using (status = 'publicado');
create policy providers_owner_read on public.providers for select to authenticated using (owner_user_id = (select auth.uid()));
create policy providers_owner_update on public.providers for update to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
grant select on public.v_public_providers to anon, authenticated;

-- provider_settings: só o dono
grant select on public.provider_settings to authenticated;
grant update (wa_number, wa_phone_number_id, wa_provider, auto_confirmation_request, reminder_24h, reminder_2h, post_service_review,
              reactivation_days, first_response_sla_min, auto_reply_outside_hours, instant_booking)
  on public.provider_settings to authenticated;
create policy settings_owner_read on public.provider_settings for select to authenticated
  using (provider_id in (select app.my_provider_ids()));
create policy settings_owner_update on public.provider_settings for update to authenticated
  using (provider_id in (select app.my_provider_ids())) with check (provider_id in (select app.my_provider_ids()));

-- services
grant select on public.services to anon, authenticated;
grant insert (provider_id, category, name, description, price_cents, unit, duration_min, species, sizes, capacity_units, active)
  on public.services to authenticated;
grant update (category, name, description, price_cents, unit, duration_min, species, sizes, capacity_units, active)
  on public.services to authenticated;
grant delete on public.services to authenticated;
create policy services_public_read on public.services for select to anon, authenticated
  using (active and exists (select 1 from public.providers p where p.id = services.provider_id and p.status = 'publicado'));
create policy services_owner_all on public.services for all to authenticated
  using (provider_id in (select app.my_provider_ids())) with check (provider_id in (select app.my_provider_ids()));
-- o tutor continua vendo o serviço das próprias reservas, mesmo se desativado depois
create policy services_booked_read on public.services for select to authenticated
  using (id in (select b.service_id from public.bookings b where b.customer_id in (select app.my_customer_ids())));

-- service_packages
grant select on public.service_packages to anon, authenticated;
grant insert (provider_id, service_id, name, description, sessions, price_cents, validity_days, active, popular)
  on public.service_packages to authenticated;
grant update (service_id, name, description, sessions, price_cents, validity_days, active, popular)
  on public.service_packages to authenticated;
grant delete on public.service_packages to authenticated;
create policy packages_public_read on public.service_packages for select to anon, authenticated
  using (active and exists (select 1 from public.providers p where p.id = service_packages.provider_id and p.status = 'publicado'));
create policy packages_owner_all on public.service_packages for all to authenticated
  using (provider_id in (select app.my_provider_ids())) with check (provider_id in (select app.my_provider_ids()));
create policy packages_bought_read on public.service_packages for select to authenticated
  using (id in (select pp.package_id from public.package_purchases pp where pp.customer_id in (select app.my_customer_ids())));

-- reviews: leitura pública das publicadas; escrita só por submit_review / reply_review
grant select on public.reviews to anon, authenticated;
create policy reviews_public_read on public.reviews for select to anon, authenticated
  using (status = 'publicada' and exists (select 1 from public.providers p where p.id = reviews.provider_id and p.status = 'publicado'));
create policy reviews_owner_read on public.reviews for select to authenticated
  using (provider_id in (select app.my_provider_ids()));

-- customers: tutor lê/edita o próprio; prestador lê os da sua carteira
grant select on public.customers to authenticated;
grant update (name, phone, email, city_id, neighborhood, wa_opt_in, marketing_opt_in) on public.customers to authenticated;
create policy customers_self_read on public.customers for select to authenticated using (user_id = (select auth.uid()));
create policy customers_self_update on public.customers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy customers_provider_read on public.customers for select to authenticated
  using (id in (select app.my_provider_customer_ids()));

-- provider_customers
grant select on public.provider_customers to authenticated;
create policy provider_customers_owner_read on public.provider_customers for select to authenticated
  using (provider_id in (select app.my_provider_ids()));

-- pets
grant select on public.pets to authenticated;
grant insert (owner_id, name, species, breed, size, birth_year, weight_kg, temperament, care_notes, vaccines_up_to_date, avatar_seed, photo_path)
  on public.pets to authenticated;
grant update (name, species, breed, size, birth_year, weight_kg, temperament, care_notes, vaccines_up_to_date, avatar_seed, photo_path)
  on public.pets to authenticated;
grant delete on public.pets to authenticated;
create policy pets_owner_all on public.pets for all to authenticated
  using (owner_id in (select app.my_customer_ids())) with check (owner_id in (select app.my_customer_ids()));
create policy pets_provider_read on public.pets for select to authenticated
  using (owner_id in (select app.my_provider_customer_ids()));

-- package_purchases: leitura (tutor dono / prestador); escrita só via create_booking
grant select on public.package_purchases to authenticated;
create policy purchases_customer_read on public.package_purchases for select to authenticated
  using (customer_id in (select app.my_customer_ids()));
create policy purchases_provider_read on public.package_purchases for select to authenticated
  using (provider_id in (select app.my_provider_ids()));

-- bookings: leitura (tutor dono / prestador); escrita SOMENTE por RPC
grant select on public.bookings to authenticated;
create policy bookings_customer_read on public.bookings for select to authenticated
  using (customer_id in (select app.my_customer_ids()));
create policy bookings_provider_read on public.bookings for select to authenticated
  using (provider_id in (select app.my_provider_ids()));

grant select on public.booking_pets, public.booking_events to authenticated;
create policy booking_pets_read on public.booking_pets for select to authenticated
  using (booking_id in (select b.id from public.bookings b));   -- herda a RLS de bookings
create policy booking_events_read on public.booking_events for select to authenticated
  using (booking_id in (select b.id from public.bookings b));

-- favorites
grant select, insert, delete on public.favorites to authenticated;
create policy favorites_owner_all on public.favorites for all to authenticated
  using (customer_id in (select app.my_customer_ids())) with check (customer_id in (select app.my_customer_ids()));

-- conversations / messages: só o prestador; mensagens são inseridas pelo servidor (edge functions / RPC)
grant select on public.conversations to authenticated;
grant update (status, tags, unread, assigned_to) on public.conversations to authenticated;
create policy conversations_owner_read on public.conversations for select to authenticated
  using (provider_id in (select app.my_provider_ids()));
create policy conversations_owner_update on public.conversations for update to authenticated
  using (provider_id in (select app.my_provider_ids())) with check (provider_id in (select app.my_provider_ids()));
grant select on public.messages to authenticated;
create policy messages_owner_read on public.messages for select to authenticated
  using (provider_id in (select app.my_provider_ids()));

-- wa_templates: globais + do próprio prestador (somente leitura no front)
grant select on public.wa_templates to authenticated;
create policy templates_read on public.wa_templates for select to authenticated
  using (provider_id is null or provider_id in (select app.my_provider_ids()));

-- wa_webhook_events: nenhuma policy → só service_role (BYPASSRLS)

-- =====================================================================================
-- Privilégios de funções: revoga de PUBLIC/anon e concede só o necessário
-- =====================================================================================
revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;

-- helpers usados nas policies (avaliadas com o papel do chamador)
grant execute on function app.my_provider_ids(), app.my_customer_ids(), app.my_provider_customer_ids() to authenticated;

grant execute on function
  public.create_booking(uuid, uuid, uuid[], timestamptz, text, text, uuid, uuid, jsonb),
  public.create_manual_booking(uuid, uuid, uuid[], timestamptz, text, text),
  public.update_booking_status(uuid, text, text),
  public.cancel_my_booking(uuid, text),
  public.reply_confirmation(uuid, text),
  public.reschedule_booking(uuid, timestamptz),
  public.submit_review(uuid, integer, integer, integer, integer, text),
  public.reply_review(uuid, text),
  public.register_provider(text, text, text[], text, text, text, text, text),
  public.busy_slots(uuid, uuid, timestamptz, timestamptz),
  public.delete_my_account(),
  public.public_stats()
to authenticated;
grant execute on function public.public_stats() to anon;                                  -- exceção documentada: só agregados
grant execute on function public.wa_apply_confirmation(uuid, text) to service_role;        -- só o webhook
grant execute on function public.wa_template_vars(uuid) to service_role;                     -- só a edge function
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app to service_role;

revoke all on sequence app.booking_code_seq from public, anon, authenticated;
grant usage, select on sequence app.booking_code_seq to service_role;

-- =====================================================================================
-- Realtime (postgres_changes respeita RLS)
-- =====================================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings, public.conversations, public.messages, public.reviews, public.package_purchases;
  end if;
end $$;

-- =====================================================================================
-- Storage: pet-photos (privado) e provider-media (público). Pasta raiz = auth.uid().
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('pet-photos', 'pet-photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('provider-media', 'provider-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy pet_photos_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy pet_photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy pet_photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy pet_photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy provider_media_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'provider-media');
create policy provider_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'provider-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy provider_media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'provider-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'provider-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy provider_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'provider-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
