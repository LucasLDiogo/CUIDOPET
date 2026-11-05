-- 0002 — identidade, papéis, organizações. Dados privados em schema `private`.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_subject text not null unique,
  display_name text not null check (length(display_name) between 1 and 80),
  photo_ref text,
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  locale text not null default 'pt-BR',
  adult_declared_at timestamptz,                 -- política inicial: contas 18+
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_updated before update on public.users for each row execute function app.set_updated_at();

-- Contatos e identidade civil NUNCA em tabelas públicas.
create table private.user_contacts (
  user_id uuid primary key references public.users(id) on delete cascade,
  email text,
  email_verified_at timestamptz,
  phone text,
  phone_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table private.private_identities (
  user_id uuid primary key references public.users(id) on delete restrict,
  full_name_enc bytea,                 -- cifrado na aplicação (envelope); nunca em claro
  document_hmac text unique,           -- HMAC do CPF/CNPJ para dedupe/consulta sem expor o valor
  document_enc bytea,
  verification_ref text,               -- referência do verificador hospedado; sem imagens do documento
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('tutor','provider','org_manager','support','trust_safety','finance','advertiser','admin')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete restrict,
  kind text not null check (kind in ('PF','PJ')),
  display_name text not null,
  billing_ref text,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated before update on public.organizations for each row execute function app.set_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  member_role text not null check (member_role in ('owner','manager','staff')),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now()
);
create unique index memberships_active_uq on public.memberships (organization_id, user_id) where status = 'active';
create index memberships_user_idx on public.memberships (user_id) where status = 'active';

-- Helpers de autorização (SECURITY DEFINER: evitam recursão de RLS; search_path fixo).
create or replace function app.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.memberships m
                 where m.organization_id = org and m.user_id = app.uid() and m.status = 'active')
$$;

create or replace function app.has_role(r text) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = app.uid() and ur.role = r)
$$;

revoke all on function app.is_org_member(uuid), app.has_role(text) from public;
grant execute on function app.is_org_member(uuid), app.has_role(text) to cuidope_app, cuidope_service;
