-- 0001 — base: schemas, papéis, helpers. PostgreSQL ≥ 15.
create extension if not exists btree_gist;

create schema if not exists app;      -- funções internas (SECURITY DEFINER), nunca expostas como API pública
create schema if not exists private;  -- dados privados: schema/grants separados (spec §5/§20)

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'cuidope_anon')    then create role cuidope_anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'cuidope_app')     then create role cuidope_app nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'cuidope_service')  then create role cuidope_service nologin; end if;
end $$;

grant usage on schema public to cuidope_anon, cuidope_app, cuidope_service;
grant usage on schema app to cuidope_app, cuidope_service;
grant usage on schema private to cuidope_app, cuidope_service;  -- anon NUNCA acessa private

-- Usuário da sessão: o API faz `SET LOCAL ROLE cuidope_app; SELECT set_config('app.user_id', <uuid>, true)`.
-- O cliente nunca escolhe o papel nem o id.
create or replace function app.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Configuração versionada da plataforma (comissão, TTL de hold etc.)
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings(key, value) values
  ('commission_bps', '1200'),          -- hipótese: 12% (spec §12) — validar no piloto
  ('hold_ttl_minutes', '15'),
  ('review_window_days', '14'),
  ('ranking_version', '"rk-2026-10-v1"'),
  ('campaigns_kill_switch', 'false');
grant select on public.platform_settings to cuidope_app, cuidope_service;
