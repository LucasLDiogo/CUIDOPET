-- 0005 — pedidos, pagamentos, inbox/outbox e ledger de partidas dobradas. Dinheiro em centavos inteiros.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('subscription','advertising','booking')),
  buyer_id uuid not null references public.users(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  booking_id uuid unique references public.bookings(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete restrict,
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  subtotal_cents integer not null check (subtotal_cents > 0),
  fees_cents integer not null default 0 check (fees_cents >= 0),
  total_cents integer not null check (total_cents = subtotal_cents + fees_cents),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','paid','paid_unallocated','cancelled','expired')),
  snapshot jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((purpose = 'booking') = (booking_id is not null)),
  check ((purpose = 'subscription') = (subscription_id is not null))
);
create trigger orders_updated before update on public.orders for each row execute function app.set_updated_at();

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  description text not null,
  amount_cents integer not null check (amount_cents > 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  external_id text not null,                     -- ID do PSP; único por provedor
  purpose text not null check (purpose in ('subscription','advertising','booking')),
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('pix','card')),
  status text not null default 'created' check (status in ('created','pending','confirmed','settled','failed','expired','refund_pending','partially_refunded','refunded','chargeback')),
  pix_expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);
create trigger payments_updated before update on public.payments for each row execute function app.set_updated_at();

-- Webhook: persistir primeiro (deduplicado), processar depois. Payload mínimo + hash.
create table public.webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload_hash text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  unique (provider, event_id)
);

create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version integer not null default 1,
  correlation_id text,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  attempts integer not null default 0
);
create index outbox_pending_idx on public.outbox (occurred_at) where published_at is null;

create table public.idempotency_keys (
  user_id uuid not null,
  scope text not null,
  key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, scope, key)
);

-- Ledger
create table public.ledger_accounts (
  code text primary key,
  kind text not null check (kind in ('asset','liability','revenue','expense','contra'))
);
insert into public.ledger_accounts values
  ('psp_cash','asset'),('provider_payable','liability'),('unallocated_payments','liability'),
  ('commission_revenue','revenue'),('subscription_revenue','revenue'),('advertising_revenue','revenue'),
  ('psp_fees','expense'),('refunds','contra'),('disputes','contra');

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  origin_key text not null unique,               -- idempotência: 1 transação por operação externa
  description text not null,
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  reverses_id uuid references public.ledger_transactions(id),
  created_at timestamptz not null default now()
);
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  account_code text not null references public.ledger_accounts(code),
  debit_cents integer not null default 0 check (debit_cents >= 0),
  credit_cents integer not null default 0 check (credit_cents >= 0),
  check ((debit_cents > 0) <> (credit_cents > 0))
);
create index ledger_entries_tx_idx on public.ledger_entries (transaction_id);

-- Imutabilidade: correção só por lançamento reversor.
create or replace function app.ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'ledger_immutable: use lançamento reversor' using errcode = 'restrict_violation'; end $$;
create trigger ledger_tx_no_update before update or delete on public.ledger_transactions for each row execute function app.ledger_immutable();
create trigger ledger_entries_no_update before update or delete on public.ledger_entries for each row execute function app.ledger_immutable();

-- Balanceamento verificado no COMMIT (constraint trigger diferido): Σdébitos = Σcréditos por transação.
create or replace function app.ledger_check_balanced() returns trigger language plpgsql as $$
declare d bigint; c bigint;
begin
  select coalesce(sum(debit_cents),0), coalesce(sum(credit_cents),0) into d, c from public.ledger_entries where transaction_id = new.transaction_id;
  if d <> c or d = 0 then raise exception 'ledger_unbalanced: débitos % ≠ créditos %', d, c using errcode = 'check_violation'; end if;
  return null;
end $$;
create constraint trigger ledger_entries_balanced after insert on public.ledger_entries
  deferrable initially deferred for each row execute function app.ledger_check_balanced();

create or replace function app.post_ledger(p_origin text, p_desc text, p_entries jsonb, p_reverses uuid default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare tx uuid; e jsonb;
begin
  insert into public.ledger_transactions(origin_key, description, reverses_id) values (p_origin, p_desc, p_reverses)
  on conflict (origin_key) do nothing returning id into tx;
  if tx is null then return null; end if;      -- já lançado: idempotente
  for e in select * from jsonb_array_elements(p_entries) loop
    insert into public.ledger_entries(transaction_id, account_code, debit_cents, credit_cents)
    values (tx, e->>'account', coalesce((e->>'debit')::int, 0), coalesce((e->>'credit')::int, 0));
  end loop;
  return tx;
end $$;
revoke all on function app.post_ledger(text, text, jsonb, uuid) from public;
grant execute on function app.post_ledger(text, text, jsonb, uuid) to cuidope_service;
