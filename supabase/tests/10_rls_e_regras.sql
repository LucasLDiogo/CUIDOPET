-- =====================================================================================
-- Testes de RLS e regras de negócio do Cuidopê.
-- Pré-requisitos: 00_stubs_supabase.sql (fora do Supabase) + migration + seed.sql.
-- Rodar:  psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/10_rls_e_regras.sql
-- Qualquer assert que falhar aborta com erro "FALHOU: ...". Tudo roda numa transação com ROLLBACK.
-- Sem meta-comandos do psql (compatível com PGlite).
-- =====================================================================================
begin;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create table tests.ctx (k text primary key, v uuid);
grant select on tests.ctx to anon, authenticated, service_role;
create table tests.log (n serial, msg text);
grant insert, select on tests.log to anon, authenticated, service_role;
grant usage on sequence tests.log_n_seq to anon, authenticated, service_role;

create function tests.id(p text) returns uuid language sql stable as $$ select v from tests.ctx where k = p $$;
create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALHOU: %', p_msg; end if;
  insert into tests.log (msg) values ('ok  ' || p_msg);
end $$;
-- executa SQL com o papel atual e exige erro (opcionalmente com SQLSTATE específico)
create function tests.err(p_sql text, p_msg text, p_state text default null) returns void language plpgsql as $$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;
    if p_state is not null and v_state <> p_state then
      raise exception 'FALHOU: % (esperava SQLSTATE %, veio % — %)', p_msg, p_state, v_state, sqlerrm;
    end if;
    insert into tests.log (msg) values ('ok  ' || p_msg || ' [' || v_state || ']');
    return;
  end;
  raise exception 'FALHOU: % (esperava erro, executou sem erro)', p_msg;
end $$;
create function tests.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- Contexto (como postgres): ids do seed + dois usuários extras
-- -------------------------------------------------------------------------------------
insert into tests.ctx values
  ('ana_uid',   '6e55f5bf-2d77-5f84-88ba-ce2fb14eed8d'),
  ('carla_uid', '589b4c60-1528-5e6f-ae15-942ed1e17da2'),
  ('bruno_uid', '00000000-0000-4000-8000-0000000000b1'),
  ('diego_uid', '00000000-0000-4000-8000-0000000000d1');
insert into tests.ctx select 'ana', id from public.customers where user_id = tests.id('ana_uid');
insert into tests.ctx select 'carla', id from public.providers where owner_user_id = tests.id('carla_uid');
insert into tests.ctx select 'bossa', id from public.providers where slug = 'banho-bossa-pet-shop';
insert into tests.ctx select 'fernanda', id from public.providers where slug like 'dra-fernanda-lopes%';
insert into tests.ctx select 'diego', id from public.providers where slug = 'diego-passeios';
insert into tests.ctx select 'matheus', id from public.providers where slug = 'matheus-dog-walker';
insert into tests.ctx select 'thor', id from public.pets where owner_id = tests.id('ana') and name = 'Thor';
insert into tests.ctx select 'mia', id from public.pets where owner_id = tests.id('ana') and name = 'Mia';
insert into tests.ctx select 'svc_passeio60', id from public.services where provider_id = tests.id('carla') and name = 'Passeio 60 min';
insert into tests.ctx select 'pur_ana_10p', pp.id from public.package_purchases pp
  join public.service_packages sp on sp.id = pp.package_id where pp.customer_id = tests.id('ana') and sp.name like '10 passeios%';
insert into tests.ctx select 'ana_aguardando', id from public.bookings
  where customer_id = tests.id('ana') and status = 'aguardando_cliente' order by start_at limit 1;
insert into tests.ctx select 'ana_vet', id from public.bookings
  where customer_id = tests.id('ana') and provider_id = tests.id('fernanda') and status = 'concluido' limit 1;
insert into tests.ctx select 'ana_bossa_futura', id from public.bookings
  where customer_id = tests.id('ana') and provider_id = tests.id('bossa') and status = 'confirmado' limit 1;
insert into tests.ctx select 'carla_pendente', id from public.bookings
  where provider_id = tests.id('carla') and status = 'pendente' and customer_id <> tests.id('ana') order by start_at limit 1;
insert into tests.ctx select 'carla_concluida', id from public.bookings
  where provider_id = tests.id('carla') and status = 'concluido' limit 1;
insert into tests.ctx select 'review_carla', id from public.reviews where provider_id = tests.id('carla') limit 1;
insert into tests.ctx select 'review_bossa', id from public.reviews where provider_id = tests.id('bossa') limit 1;
insert into tests.ctx select 'svc_diego', id from public.services where provider_id = tests.id('diego') limit 1;

-- reserva antiga concluída sem avaliação (janela de 14 dias vencida)
update public.bookings set reviewed = false
 where id = (select id from public.bookings where customer_id = tests.id('ana') and status = 'concluido' and end_at < now() - interval '20 days' order by end_at limit 1);
insert into tests.ctx select 'ana_antiga', id from public.bookings
  where customer_id = tests.id('ana') and status = 'concluido' and end_at < now() - interval '20 days' and not reviewed order by end_at limit 1;

-- usuários extras: Bruno (tutor, não vinculado à Carla) e dono do "Diego Passeios"
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  (tests.id('bruno_uid'), 'bruno@exemplo.com.br', '{}', '{"full_name":"Bruno Teste","role":"prestador"}'),
  (tests.id('diego_uid'), 'diego@exemplo.com.br', '{}', '{"full_name":"Diego Teste"}');
update public.providers set owner_user_id = tests.id('diego_uid') where id = tests.id('diego');
insert into tests.ctx select 'bruno', id from public.customers where user_id = tests.id('bruno_uid');
insert into public.pets (owner_id, name, species, size) values (tests.id('bruno'), 'Rex', 'cao', 'medio');
insert into tests.ctx select 'rex', id from public.pets where owner_id = tests.id('bruno');
update public.providers set status = 'suspenso' where id = tests.id('matheus');

select tests.ok((select count(*) from tests.ctx where v is null) = 0, 'contexto de teste completo (nenhum id nulo)');
select tests.ok((select role from public.profiles where id = tests.id('bruno_uid')) = 'tutor',
  'papel NÃO vem de raw_user_meta_data (Bruno pediu "prestador", ficou tutor)');

-- =====================================================================================
-- 1) ANON
-- =====================================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select tests.err('select count(*) from public.customers', 'anon NÃO lê customers', '42501');
select tests.err('select count(*) from public.pets', 'anon NÃO lê pets', '42501');
select tests.err('select count(*) from public.bookings', 'anon NÃO lê bookings', '42501');
select tests.err('select count(*) from public.messages', 'anon NÃO lê messages', '42501');
select tests.err('select owner_user_id from public.providers limit 1', 'anon NÃO lê providers.owner_user_id', '42501');
select tests.ok((select count(*) from public.v_public_providers) = 25, 'anon vê só prestadores publicados (25 de 26; 1 suspenso)');
select tests.ok(not exists (select 1 from public.v_public_providers where id = tests.id('matheus')), 'prestador suspenso some do catálogo');
select tests.ok(not exists (select 1 from public.v_public_providers where not whatsapp_opt_in and whatsapp_public is not null),
  'WhatsApp só aparece com opt-in');
select tests.ok((select count(*) from public.reviews) > 1000, 'anon lê avaliações publicadas');
select tests.ok(not exists (select 1 from public.services where provider_id = tests.id('matheus')), 'serviços de prestador suspenso ocultos');
select tests.ok((public.public_stats()->>'providers')::int = 25, 'public_stats liberado para anon (só agregados)');
select tests.err($$select public.create_booking(gen_random_uuid(), gen_random_uuid(), '{}', now(), '', 'casa_tutor')$$, 'anon NÃO executa create_booking', '42501');
select tests.err($$insert into public.reviews (provider_id, author_name, rating, aspect_pontualidade, aspect_cuidado, aspect_comunicacao) values (gen_random_uuid(), 'x', 5, 5, 5, 5)$$,
  'anon NÃO insere review', '42501');
reset role;

-- =====================================================================================
-- 2) TUTORA ANA
-- =====================================================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', tests.id('ana_uid'), 'role', 'authenticated')::text, true);

select tests.ok((select count(*) from public.pets) = 2, 'Ana vê só os 2 pets dela');
select tests.ok(not exists (select 1 from public.pets where id = tests.id('rex')), 'tutor A NÃO lê pets do tutor B');
select tests.err(format($$insert into public.pets (owner_id, name, species, size) values (%L, 'Intruso', 'cao', 'mini')$$, tests.id('bruno')),
  'Ana NÃO cria pet em nome do Bruno', '42501');
select tests.ok(tests.affected(format($$update public.pets set name = 'Hackeado' where id = %L$$, tests.id('rex'))) = 0, 'Ana NÃO altera pet do Bruno (0 linhas)');
select tests.err(format($$update public.pets set owner_id = %L where id = %L$$, tests.id('bruno'), tests.id('thor')), 'owner_id do pet é imutável', '42501');
select tests.ok((select count(*) from public.customers) = 1, 'Ana lê só o próprio customer');
select tests.err(format($$update public.customers set user_id = %L$$, tests.id('bruno_uid')), 'Ana NÃO altera customers.user_id', '42501');
select tests.ok(not exists (select 1 from public.bookings where customer_id <> tests.id('ana')), 'Ana lê só as próprias reservas');
select tests.err($$update public.bookings set status = 'confirmado'$$, 'tutor NÃO altera status direto', '42501');
select tests.err($$update public.bookings set price_cents = 0$$, 'tutor NÃO altera preço direto', '42501');
select tests.err($$insert into public.bookings (provider_id, customer_id, service_id, start_at, end_at, price_cents) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), now(), now() + interval '1 hour', 0)$$,
  'tutor NÃO insere booking direto', '42501');
select tests.ok((select count(*) from public.conversations) = 0, 'tutor não vê o CRM de conversas');
select tests.err(format($$select public.update_booking_status(%L, 'cancelado')$$, tests.id('ana_aguardando')), 'tutor NÃO usa update_booking_status', 'CP403');
select tests.err($$update public.package_purchases set sessions_used = 0$$, 'tutor NÃO mexe no saldo do pacote', '42501');

-- confirmação pelo app
select tests.ok((public.reply_confirmation(tests.id('ana_aguardando'), 'SIM')).status = 'confirmado', 'reply_confirmation SIM → confirmado');
select tests.err(format($$select public.reply_confirmation(%L, 'SIM')$$, tests.id('ana_aguardando')), 'responder de novo → transição inválida', 'CP409');

-- criação de reserva com preço calculado no servidor
select tests.ok((select price_cents from public.services where id = tests.id('svc_passeio60')) = 4800, 'preço base do Passeio 60 min = R$ 48,00');
create temp table t_new on commit drop as
  select * from public.create_booking(tests.id('carla'), tests.id('svc_passeio60'), array[tests.id('thor')],
    ((current_date + 20)::timestamp + time '10:00') at time zone 'America/Sao_Paulo', 'teste automático', 'casa_tutor', null, null,
    '{"name":"Ana Paula Ribeiro","phone":"+5554991234567","email":"ana.ribeiro@exemplo.com.br","waOptIn":true,"marketingOptIn":false}');
select tests.ok((select status = 'pendente' and price_cents = 4800 and commission_cents = 576 from t_new), 'create_booking: pendente, preço 4800 e comissão 12% (576) calculados no servidor');
select tests.ok((select count(*) from public.booking_pets where booking_id = (select id from t_new)) = 1, 'create_booking grava booking_pets');
select tests.ok((select count(*) from public.booking_events where booking_id = (select id from t_new) and type = 'criado') = 1, 'create_booking grava booking_event criado');
select tests.err(format($$select public.create_booking(%L, %L, array[%L]::uuid[], now() - interval '1 hour', '', 'casa_tutor')$$, tests.id('carla'), tests.id('svc_passeio60'), tests.id('thor')),
  'horário no passado é recusado', 'CP422');
select tests.err(format($$select public.create_booking(%L, %L, array[%L]::uuid[], now() + interval '20 days', '', 'casa_tutor')$$, tests.id('carla'), tests.id('svc_passeio60'), tests.id('mia')),
  'espécie incompatível (gata em passeio) é recusada', 'CP422');
select tests.err(format($$select public.create_booking(%L, %L, array[%L]::uuid[], now() + interval '20 days', '', 'casa_tutor')$$, tests.id('carla'), tests.id('svc_passeio60'), tests.id('rex')),
  'pet de outro tutor é recusado', 'CP403');
select tests.err(format($$select public.create_booking(%L, %L, array[%L]::uuid[], ((current_date + 20)::timestamp + time '03:00') at time zone 'America/Sao_Paulo', '', 'casa_tutor')$$,
  tests.id('carla'), tests.id('svc_passeio60'), tests.id('thor')), 'fora do horário de funcionamento é recusado', 'CP422');
-- capacidade do passeio = 2 pets simultâneos
select public.create_booking(tests.id('carla'), tests.id('svc_passeio60'), array[tests.id('thor')],
  ((current_date + 20)::timestamp + time '10:00') at time zone 'America/Sao_Paulo', '', 'casa_tutor');
select tests.err(format($$select public.create_booking(%L, %L, array[%L]::uuid[], ((current_date + 20)::timestamp + time '10:30') at time zone 'America/Sao_Paulo', '', 'casa_tutor')$$,
  tests.id('carla'), tests.id('svc_passeio60'), tests.id('thor')), 'capacidade esgotada → conflito', 'CP409');

-- consumo de saldo de pacote
create temp table t_pkg on commit drop as
  select * from public.create_booking(tests.id('carla'), tests.id('svc_passeio60'), array[tests.id('thor')],
    ((current_date + 21)::timestamp + time '10:00') at time zone 'America/Sao_Paulo', '', 'casa_tutor', null, tests.id('pur_ana_10p'));
select tests.ok((select price_cents from t_pkg) = 0, 'reserva com saldo de pacote tem preço 0');
select tests.ok((select sessions_used from public.package_purchases where id = tests.id('pur_ana_10p')) = 6, 'saldo do pacote consumido (5 → 6)');
select tests.ok((public.cancel_my_booking((select id from t_pkg), 'mudança de planos')).status = 'cancelado', 'tutor cancela a própria reserva');
select tests.ok((select sessions_used from public.package_purchases where id = tests.id('pur_ana_10p')) = 5, 'cancelamento devolve a sessão do pacote (6 → 5)');
select tests.err(format($$select public.cancel_my_booking(%L, 'x')$$, tests.id('carla_pendente')), 'tutor NÃO cancela reserva de outro cliente', 'CP404');

-- avaliação
select tests.ok((select review_count from public.providers where id = tests.id('fernanda')) = 58, 'Fernanda começa com 58 avaliações');
select tests.ok((public.submit_review(tests.id('ana_vet'), 5, 5, 5, 4, 'Atendeu a Mia com muita calma.')).author_name = 'Ana R.', 'submit_review grava autor minimizado (Ana R.)');
select tests.ok((select review_count from public.providers where id = tests.id('fernanda')) = 59, 'trigger recalcula review_count do prestador (59)');
select tests.err(format($$select public.submit_review(%L, 5, 5, 5, 5, 'de novo')$$, tests.id('ana_vet')), '1 avaliação por reserva', 'CP409');
select tests.err(format($$select public.submit_review(%L, 5, 5, 5, 5, 'atrasada')$$, tests.id('ana_antiga')), 'janela de 14 dias para avaliar', 'CP409');
select tests.err(format($$select public.submit_review(%L, 5, 5, 5, 5, 'cedo')$$, tests.id('ana_bossa_futura')), 'só avalia atendimento concluído', 'CP409');
select tests.err(format($$update public.providers set rating = 5 where id = %L$$, tests.id('carla')), 'tutor NÃO altera nota', '42501');

-- favoritos
insert into public.favorites (customer_id, provider_id) values (tests.id('ana'), tests.id('diego'));
select tests.err(format($$insert into public.favorites (customer_id, provider_id) values (%L, %L)$$, tests.id('bruno'), tests.id('diego')),
  'Ana NÃO favorita em nome do Bruno', '42501');

-- storage: pasta = auth.uid()
insert into storage.objects (bucket_id, name) values ('pet-photos', tests.id('ana_uid') || '/thor.jpg');
select tests.err(format($$insert into storage.objects (bucket_id, name) values ('pet-photos', %L)$$, tests.id('bruno_uid') || '/x.jpg'),
  'upload fora da própria pasta é negado', '42501');
select tests.err($$select public.wa_apply_confirmation(gen_random_uuid(), 'SIM')$$, 'authenticated NÃO chama wa_apply_confirmation', '42501');
select tests.err($$select count(*) from public.wa_webhook_events$$, 'authenticated NÃO lê wa_webhook_events', '42501');
reset role;

-- =====================================================================================
-- 3) PRESTADORA CARLA
-- =====================================================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', tests.id('carla_uid'), 'role', 'authenticated')::text, true);

select tests.ok((select count(*) from public.bookings) > 100, 'Carla lê as reservas do seu provider');
select tests.ok(not exists (select 1 from public.bookings where provider_id <> tests.id('carla')), 'prestador NÃO lê reservas de outro prestador');
select tests.ok(not exists (select 1 from public.bookings where id = tests.id('ana_bossa_futura')), 'Carla não vê a reserva da Ana na Bossa');
select tests.ok(exists (select 1 from public.customers where id = tests.id('ana')), 'Carla lê cliente da carteira (Ana)');
select tests.ok(not exists (select 1 from public.customers where id = tests.id('bruno')), 'Carla NÃO lê cliente fora da carteira (Bruno)');
select tests.ok(exists (select 1 from public.pets where id = tests.id('thor')), 'Carla lê pets de clientes da carteira');
select tests.ok(not exists (select 1 from public.pets where id = tests.id('rex')), 'Carla NÃO lê pets fora da carteira');
select tests.ok((select count(*) from public.provider_settings) = 1, 'Carla lê só as próprias configurações');
select tests.ok(not exists (select 1 from public.conversations where provider_id <> tests.id('carla')), 'conversas só do próprio provider');
select tests.ok(not exists (select 1 from public.messages where provider_id <> tests.id('carla')), 'mensagens só do próprio provider');
select tests.ok(exists (select 1 from public.messages where template = 'pedido_recebido' and text like '%Thor%' and at > now() - interval '1 minute'),
  'create_booking gerou mensagem pedido_recebido na conversa');
select tests.err($$insert into public.messages (conversation_id, provider_id, from_actor, text) select id, provider_id, 'prestador', 'oi' from public.conversations limit 1$$,
  'prestador NÃO insere mensagem direto (só edge function)', '42501');

-- transições
select tests.ok((public.update_booking_status(tests.id('carla_pendente'), 'aguardando_cliente')).status = 'aguardando_cliente', 'prestador aceita: pendente → aguardando_cliente');
select tests.ok((select wa_confirmation_sent_at is not null from public.bookings where id = tests.id('carla_pendente')), 'aceite marca wa_confirmation_sent_at');
select tests.err(format($$select public.update_booking_status(%L, 'pendente')$$, tests.id('carla_concluida')), 'concluido → pendente é inválido', 'CP409');
select tests.err(format($$select public.update_booking_status(%L, 'cancelado')$$, tests.id('ana_bossa_futura')), 'Carla NÃO altera reserva da Bossa', 'CP403');
select tests.ok((public.reschedule_booking(tests.id('carla_pendente'), ((current_date + 25)::timestamp + time '10:00') at time zone 'America/Sao_Paulo')).start_at
  = ((current_date + 25)::timestamp + time '10:00') at time zone 'America/Sao_Paulo', 'reschedule_booking move a reserva (horário/capacidade validados)');
select tests.ok(exists (select 1 from public.booking_events where booking_id = tests.id('carla_pendente') and type = 'remarcado'), 'remarcação gera evento');

-- colunas protegidas
select tests.err(format($$update public.providers set status = 'publicado' where id = %L$$, tests.id('carla')), 'prestador NÃO altera o próprio status', '42501');
select tests.err(format($$update public.providers set featured = true where id = %L$$, tests.id('carla')), 'prestador NÃO se auto-destaca', '42501');
select tests.err(format($$update public.providers set rating = 5 where id = %L$$, tests.id('carla')), 'prestador NÃO altera a própria nota', '42501');
select tests.ok(tests.affected(format($$update public.providers set tagline = 'Nova tagline de teste' where id = %L$$, tests.id('carla'))) = 1, 'prestador edita tagline');
select tests.ok(tests.affected(format($$update public.providers set tagline = 'invasão' where id = %L$$, tests.id('bossa'))) = 0, 'prestador NÃO edita outro prestador');
select tests.ok(tests.affected(format($$update public.services set price_cents = 5000 where id = %L$$, tests.id('svc_passeio60'))) = 1, 'prestador altera preço do próprio serviço');
select tests.ok(tests.affected(format($$update public.services set price_cents = 1 where id = %L$$, tests.id('svc_diego'))) = 0, 'prestador NÃO altera serviço alheio');
select tests.err(format($$insert into public.services (provider_id, category, name, price_cents, unit, duration_min) values (%L, 'passeio', 'Fake', 100, 'passeio', 30)$$, tests.id('diego')),
  'prestador NÃO cria serviço em outro provider', '42501');
select tests.err($$update public.service_packages set sold_count = 999$$, 'sold_count é protegido', '42501');
select tests.ok(tests.affected(format($$update public.conversations set status = 'resolvido', tags = array['teste'] where provider_id = %L and status = 'resolvido'$$, tests.id('carla'))) >= 1,
  'prestador atualiza status/tags da conversa');
select tests.ok((public.reply_review(tests.id('review_carla'), 'Obrigada pelo carinho!')).reply_text = 'Obrigada pelo carinho!', 'reply_review na própria avaliação');
select tests.err(format($$select public.reply_review(%L, 'intrometida')$$, tests.id('review_bossa')), 'reply_review em avaliação alheia', 'CP403');
select tests.err(format($$update public.reviews set rating = 1 where id = %L$$, tests.id('review_carla')), 'prestador NÃO altera nota da avaliação', '42501');
reset role;

-- =====================================================================================
-- 4) OUTRO PRESTADOR (Diego)
-- =====================================================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', tests.id('diego_uid'), 'role', 'authenticated')::text, true);
select tests.ok(not exists (select 1 from public.bookings where provider_id = tests.id('carla')), 'Diego NÃO lê reservas da Carla');
select tests.ok(not exists (select 1 from public.conversations), 'Diego não tem conversas');
select tests.ok(not exists (select 1 from public.customers where id = tests.id('ana')), 'Diego NÃO lê clientes da Carla');
reset role;

-- =====================================================================================
-- 5) SERVICE ROLE (webhook)
-- =====================================================================================
set local role service_role;
insert into public.wa_webhook_events (id, kind, payload) values ('wamid.TESTE1', 'message', '{}') on conflict (id) do nothing;
insert into public.wa_webhook_events (id, kind, payload) values ('wamid.TESTE1', 'message', '{}') on conflict (id) do nothing;
select tests.ok((select count(*) from public.wa_webhook_events where id = 'wamid.TESTE1') = 1, 'idempotência do webhook (wamid duplicado ignorado)');
select tests.ok((public.wa_apply_confirmation(tests.id('carla_pendente'), 'SIM')).status = 'confirmado', 'webhook confirma via wa_apply_confirmation (SIM)');
select tests.ok(exists (select 1 from public.booking_events where booking_id = tests.id('carla_pendente') and by_actor = 'whatsapp'), 'evento registrado como whatsapp');
reset role;

-- resultado
select msg from tests.log order by n;
select format('%s verificações OK', count(*)) as resultado from tests.log;
rollback;
