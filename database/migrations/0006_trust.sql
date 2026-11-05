-- 0006 — confiança: avaliações, consentimento/leads, chat, bloqueios, tickets, denúncias, auditoria.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  reviewer_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(id) on delete restrict,
  score_communication smallint not null check (score_communication between 1 and 5),
  score_punctuality smallint not null check (score_punctuality between 1 and 5),
  score_care smallint not null check (score_care between 1 and 5),
  score_match smallint not null check (score_match between 1 and 5),
  comment text check (length(comment) <= 2000),
  label text not null default 'reserva_paga' check (label in ('reserva_paga','externa_confirmada')),
  moderation_status text not null default 'published' check (moderation_status in ('published','hidden','removed')),
  provider_reply text,
  created_at timestamptz not null default now(),
  unique (booking_id, reviewer_id)             -- uma avaliação por tutor/reserva
);

-- Regra no banco, independente do caminho de escrita (spec §16).
create or replace function app.guard_review() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare b record; win integer;
begin
  select * into b from public.bookings where id = new.booking_id;
  if not found then raise exception 'booking_not_found' using errcode = 'foreign_key_violation'; end if;
  if new.reviewer_id <> b.tutor_id then raise exception 'review_not_tutor' using errcode = 'check_violation'; end if;
  if b.status <> 'completed' or b.completed_at is null then raise exception 'review_booking_not_completed' using errcode = 'check_violation'; end if;
  if new.provider_id <> b.provider_id then raise exception 'review_provider_mismatch' using errcode = 'check_violation'; end if;
  select (value)::int into win from public.platform_settings where key = 'review_window_days';
  if now() > b.completed_at + make_interval(days => win) then raise exception 'review_window_closed' using errcode = 'check_violation'; end if;
  if new.label = 'reserva_paga' and not exists (
      select 1 from public.orders o join public.payments p on p.order_id = o.id
       where o.booking_id = b.id and p.status in ('confirmed','settled','partially_refunded')) then
    raise exception 'review_not_paid' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger reviews_guard before insert on public.reviews for each row execute function app.guard_review();

-- Nota agregada: somente avaliações publicadas de reserva paga; nunca alterada por plano/patrocínio.
create or replace function app.refresh_provider_metrics(p_provider uuid) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.provider_metrics(provider_id, rating_avg, rating_count)
  select p_provider,
         round(avg((score_communication + score_punctuality + score_care + score_match) / 4.0)::numeric, 2),
         count(*)
    from public.reviews where provider_id = p_provider and moderation_status = 'published' and label = 'reserva_paga'
  on conflict (provider_id) do update
     set rating_avg = excluded.rating_avg, rating_count = excluded.rating_count, updated_at = now();
end $$;
create or replace function app.reviews_after_change() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin perform app.refresh_provider_metrics(coalesce(new.provider_id, old.provider_id)); return null; end $$;
create trigger reviews_metrics after insert or update of moderation_status on public.reviews for each row execute function app.reviews_after_change();

-- Consentimento por finalidade, canal e alvo (spec §10, §18).
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  purpose text not null check (purpose in ('commercial_proposal','marketing','analytics_optional','geolocation')),
  channel text not null check (channel in ('chat','whatsapp','email','push','web')),
  target_provider_id uuid references public.provider_profiles(id),
  target_listing_id uuid references public.service_listings(id),
  text_version text not null,
  text_snapshot text not null,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (purpose <> 'commercial_proposal' or (target_provider_id is not null and target_listing_id is not null and expires_at is not null)),
  check ((status = 'revoked') = (revoked_at is not null))
);
create index consent_user_idx on public.consent_records (user_id, purpose, status);

create table public.authorized_leads (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null unique references public.consent_records(id) on delete restrict,
  tutor_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(id) on delete restrict,
  listing_id uuid not null references public.service_listings(id) on delete restrict,
  status text not null default 'open' check (status in ('open','sent','closed')),
  initial_sent_at timestamptz,
  reminders_sent smallint not null default 0 check (reminders_sent between 0 and 1),
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique references public.service_requests(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('tutor','provider','staff')),
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete restrict,
  body text not null check (length(body) between 1 and 4000),
  attachment_ref text,
  status text not null default 'sent' check (status in ('sent','hidden')),
  created_at timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at);

create or replace function app.is_participant(conv uuid) returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.conversation_participants cp where cp.conversation_id = conv and cp.user_id = app.uid())
$$;
revoke all on function app.is_participant(uuid) from public;
grant execute on function app.is_participant(uuid) to cuidope_app, cuidope_service;

create table public.user_blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create sequence public.protocol_seq;
create or replace function app.new_protocol(prefix text) returns text language sql as $$
  select prefix || '-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || '-' || lpad(nextval('public.protocol_seq')::text, 6, '0')
$$;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique default app.new_protocol('CP'),
  requester_id uuid not null references public.users(id) on delete restrict,
  booking_id uuid references public.bookings(id),
  category text not null check (category in ('cadastro','pagamento','cancelamento','reembolso','cuidados','publicidade','privacidade','assedio','fraude','maus_tratos','conteudo')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  status text not null default 'open' check (status in ('open','triage','waiting_user','analysis','resolved','appeal','closed')),
  subject text not null check (length(subject) between 3 and 200),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tickets_updated before update on public.tickets for each row execute function app.set_updated_at();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique default app.new_protocol('DN'),
  reporter_id uuid not null references public.users(id) on delete restrict,   -- nunca revelado ao denunciado
  subject_type text not null check (subject_type in ('profile','message','review','booking','user','listing')),
  subject_id uuid not null,
  reason text not null check (length(reason) between 3 and 2000),
  status text not null default 'open' check (status in ('open','triage','analysis','decided','appeal','closed')),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  object_type text not null,
  object_id uuid,
  justification text,
  created_at timestamptz not null default now()
);
create trigger audit_no_change before update or delete on public.audit_logs for each row execute function app.ledger_immutable();

create or replace function app.audit(p_action text, p_object_type text, p_object_id uuid, p_justification text) returns void
language sql security definer set search_path = pg_catalog, public as $$
  insert into public.audit_logs(actor_id, action, object_type, object_id, justification) values (app.uid(), p_action, p_object_type, p_object_id, p_justification)
$$;
revoke all on function app.audit(text, text, uuid, text) from public;
grant execute on function app.audit(text, text, uuid, text) to cuidope_app, cuidope_service;
