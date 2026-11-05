# Cuidopê — backend Supabase e Firebase

Este guia explica como subir, testar e publicar os dois backends reais do Cuidopê. O front-end conversa
só com a interface `Repository` (`apps/web/src/data/repository.ts`). O backend é escolhido por
`VITE_DATA_BACKEND` = `demo` | `supabase` | `firebase`.

| Peça | Onde fica |
|---|---|
| Schema, RLS, funções, storage | `supabase/migrations/20261104000100_cuidope_marketplace.sql` |
| Dados de demonstração (gerados) | `supabase/seed.sql`, gerado por `apps/web/scripts/gerar-seed-sql.mjs` |
| Edge Functions (Deno) | `supabase/functions/whatsapp-webhook`, `supabase/functions/whatsapp-send`, `supabase/functions/_shared` |
| Testes SQL (RLS e regras) | `supabase/tests/` (`run-psql.sh`, `run-pglite.mjs`) |
| Adaptador Supabase | `apps/web/src/data/supabaseAdapter.ts`, com `createSupabaseRepository()` |
| Adaptador Firebase | `apps/web/src/data/firebaseAdapter.ts`, com `createFirebaseRepository()` |
| Agregações do painel (compartilhadas) | `apps/web/src/data/dashboard.ts` |
| Firebase | `firebase.json`, `.firebaserc` (exemplo), `firestore.rules`, `firestore.indexes.json`, `storage.rules` |
| Teste Firebase (emulador) | `tests/firebase/adapter-e-rules.mjs` |
| Segurança e LGPD | `SECURITY.md` |

---

## 1. Supabase local

**Pré-requisitos:** Supabase CLI 2.x, Docker e Node ≥ 22.18 (para gerar o seed sem dependências extras).

```bash
# na raiz do repositório
supabase start            # sobe Postgres, Auth, PostgREST, Realtime, Storage e Studio
supabase db reset         # aplica a migration e roda supabase/seed.sql
supabase status           # mostra API URL e a chave anon/publishable
```

Depois crie `apps/web/.env.local` a partir de `apps/web/.env.example`:

```dotenv
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<chave anon/publishable do `supabase status`>
VITE_DEMO_LOGIN=true
VITE_DEMO_PASSWORD=Cuidope!Demo2026
```

> **Nunca** use a `service_role`/`sb_secret_...` no front. O adaptador se recusa a iniciar se a chave parecer secreta.

Studio: http://127.0.0.1:54323. Os e-mails de OTP/magic link aparecem no Mailpit/Inbucket local, que o `supabase status` lista.

### 1.1 Logins de demonstração (somente demo)

| Papel | E-mail | Vínculo |
|---|---|---|
| Tutora | `ana.demo@cuidope.app` | customer `cus-ana` (Ana Paula Ribeiro, pets Thor e Mia) |
| Prestadora | `carla.demo@cuidope.app` | provider `prv-carla` (Casa da Carla Pet House) |

Senha **SOMENTE-DEMO**: `Cuidope!Demo2026`. Para trocar, rode `CUIDOPE_DEMO_PASSWORD=... node scripts/gerar-seed-sql.mjs`.
Esses usuários existem apenas no seed. O seed nunca deve rodar em produção, porque `supabase db push` não executa `seed.sql`.
No front, `signInDemo()` só funciona com `VITE_DEMO_LOGIN=true` e `VITE_DEMO_PASSWORD` definidos.

### 1.2 Regenerar o seed

```bash
cd apps/web
node scripts/gerar-seed-sql.mjs             # datas relativas (padrão)
node scripts/gerar-seed-sql.mjs --absoluto  # datas fixas da geração
```

- O script importa `src/data/demo/seed.ts` (`generateDemo()`) usando o *type stripping* nativo do Node 22.18+. Um hook de
  resolução (`module.registerHooks`) completa os imports sem extensão (`'./catalog'` → `./catalog.ts`). Não precisa de esbuild nem tsx.
- **IDs:** cada ID textual da demo (`prv-carla`, `svc-000a`, `bkg-01x2`...) vira **UUID v5** com o namespace
  `uuidv5(DNS, 'cuidope.app')` = `bf368949-2bb3-5eac-ad55-9ed4d1d5dc7d`. A mesma entrada sempre gera o mesmo UUID, então os
  links e os testes continuam estáveis entre resets. Exemplos: `cus-ana` → `75cf6fd6-8846-5c67-8be6-2b783da469d6`,
  `prv-carla` → `95de4aa7-e219-5165-8e87-0c1d3db9bfa4`.
- **Datas relativas:** cada timestamp sai como `pg_temp.ts('<ISO>')`, que soma a diferença em **dias inteiros** entre
  hoje (America/Sao_Paulo) e o dia da geração. A agenda da demo sempre parece "de hoje" e o horário do dia não muda.
- Todo registro sai com `is_demo = true`. O seed roda numa transação com `cuidope.seeding = on`, o que desliga os
  efeitos colaterais dos triggers (contadores, SLA). No fim, a nota de cada prestador é recalculada pela mesma função do trigger.
- Correção aplicada no script: `hoursFor()` da demo repete o domingo nos prestadores de hospedagem e pet sitter. O script
  mantém só a primeira ocorrência, que é a mesma que `daySlots()` usa (`Array.find`).

### 1.3 Testes do banco (sem `supabase start`)

```bash
# PostgreSQL 15+ puro (cria e apaga o banco cuidope_test)
DB_URL=postgresql:///postgres supabase/tests/run-psql.sh

# PGlite (Postgres WASM): instale fora do app
mkdir -p /tmp/pglite && (cd /tmp/pglite && npm i @electric-sql/pglite@0.3.15)
PGLITE_DIR=/tmp/pglite node supabase/tests/run-pglite.mjs
```

`00_stubs_supabase.sql` cria stubs mínimos de `auth.uid()`/`auth.jwt()`, `auth.users`, `storage.*`, dos papéis
`anon`/`authenticated`/`service_role` e da publicação `supabase_realtime`. **Não rode os stubs num projeto Supabase.**
`10_rls_e_regras.sql` roda 93 verificações dentro de uma transação com ROLLBACK, entre elas:
anon não lê customers, a tutora A não lê os pets do tutor B, um prestador não lê reservas de outro, o preço é calculado no
servidor, a capacidade é respeitada, o saldo de pacote é consumido e devolvido, as transições inválidas são recusadas,
a avaliação é aceita 1 vez por reserva e só em até 14 dias, o webhook é idempotente, o storage aceita só a pasta = uid e
as colunas protegidas (status/nota/destaque/sold_count) são recusadas com `42501`.

---

## 2. Modelo de dados (resumo)

| `types.ts` | Tabela | Observações |
|---|---|---|
| `Category`, `City` | `categories`, `cities` | leitura pública |
| `Session` | `profiles` (+ `customers.user_id`, `providers.owner_user_id`) | papel só por `app_metadata`/RPC, nunca por `user_metadata` |
| `Provider` | `providers` + view `v_public_providers` | `verification` vira 3 colunas `verified_*`; `geo` vira `geo_lat`/`geo_lng` (3 casas) |
| `Service` | `services` | `capacity_units` (padrão por categoria = `CAPACITY` de rules.ts) |
| `ServicePackage` | `service_packages` | `full_price_cents` e `sold_count` mantidos pelo servidor |
| `Review` | `reviews` | `aspects` vira `aspect_*`; `reply` vira `reply_text`/`reply_at`; `status` para moderação |
| `Customer` | `customers` + `provider_customers` | consentimentos com data (`*_opt_in_at`) |
| `Pet` | `pets` | `photo_path` no bucket privado `pet-photos` |
| `Booking` | `bookings` + `booking_pets` + `booking_events` | `petIds` vira `booking_pets`; `timeline` vira `booking_events` |
| `PackagePurchase` | `package_purchases` | saldo só por `create_booking`/transições |
| `Conversation`, `Message` | `conversations`, `messages` | `last_inbound_at` (janela de 24 h), `wa_message_id` |
| `WaTemplate`, `ProviderSettings` | `wa_templates`, `provider_settings` | `wa_phone_number_id` roteia o webhook |
| — | `wa_webhook_events` | idempotência (somente service_role) |

### 2.1 RPCs (todas SECURITY DEFINER com `search_path = ''`)

| Função | Quem | O que valida |
|---|---|---|
| `create_booking(...)` | tutor | pet do tutor, espécie e porte, horário futuro e dentro do funcionamento, capacidade (com lock), preço no servidor, pacote; grava booking_event e a mensagem `pedido_recebido` |
| `create_manual_booking(...)` | prestador | cliente da carteira, capacidade, preço |
| `update_booking_status(id, status, note)` | prestador dono | tabela `app.booking_transitions` (= `BOOKING_TRANSITIONS`) + quem pode executar |
| `cancel_my_booking(id, reason)` | tutor dono | transição; devolve a sessão do pacote |
| `reply_confirmation(id, 'SIM'\|'NAO'\|'REMARCAR')` | tutor dono | só a partir de `aguardando_cliente` |
| `wa_apply_confirmation(id, reply)` | **service_role** (webhook) | idem, ator `whatsapp` |
| `reschedule_booking(id, start)` | prestador dono | status, horário e capacidade |
| `submit_review(...)` | tutor dono | concluído, 1 por reserva, janela de 14 dias; o trigger recalcula a nota |
| `reply_review(id, text)` | prestador dono | tamanho |
| `register_provider(...)` | autenticado | 1 por usuário; entra `em_analise` |
| `busy_slots(...)` | autenticado | só intervalos e unidades, sem dados pessoais |
| `public_stats()` | **anon** + autenticado | só agregados (única exceção liberada a anon) |
| `delete_my_account()` | autenticado | LGPD: anonimiza e apaga o que não é necessário guardar |
| `wa_template_vars(booking)` | **service_role** | variáveis do template |

**Regra de preço do servidor** (`app.booking_price`): `price_cents` do serviço × nº de pets nas categorias
`hospedagem`, `creche` e `banho_tosa`; preço único nas demais. Com pacote, a reserva custa 0 e o valor fica na compra.
Comissão: `app.commission_cents` (12%, half-up), a mesma fórmula de `commissionCents()`.
**Atenção:** vale espelhar essa regra no adaptador demo (ou exportar um `bookingPriceCents()` em `rules.ts`) para o preço exibido bater com o cobrado.

Erros de negócio usam SQLSTATE próprios, convertidos em `AppError` pelo adaptador: `CP401` nao_autenticado,
`CP403` proibido, `CP404` nao_encontrado, `CP409` conflito, `CP422` invalido. `42501` (sem GRANT) vira proibido.

---

## 3. Edge Functions (WhatsApp Cloud API)

```bash
cp supabase/.env.example supabase/.env        # preencha; WA_DRY_RUN=true não chama a Meta
supabase functions serve --env-file supabase/.env
```

Deploy:

```bash
supabase link --project-ref <ref>
supabase secrets set --env-file supabase/.env
supabase functions deploy whatsapp-webhook --no-verify-jwt   # a Meta não envia JWT; a assinatura HMAC protege
supabase functions deploy whatsapp-send                      # exige JWT
```

| Secret | Uso |
|---|---|
| `ALLOWED_ORIGINS` | origens do front liberadas no CORS do `whatsapp-send` |
| `WA_APP_SECRET` | HMAC-SHA256 do `X-Hub-Signature-256` |
| `WA_VERIFY_TOKEN` | verificação GET do webhook |
| `WA_TOKEN` | token permanente (System User) da Cloud API |
| `WA_PHONE_NUMBER_ID` | número padrão (pode ser sobrescrito por `provider_settings.wa_phone_number_id`) |
| `WA_GRAPH_VERSION`, `WA_DRY_RUN`, `WA_RATE_LIMIT_PER_MIN` | ajustes |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | injetadas pela plataforma |

**Na Meta (WhatsApp → Configuração):** use a URL de callback `https://<ref>.supabase.co/functions/v1/whatsapp-webhook` e o
token de verificação = `WA_VERIFY_TOKEN`, e assine o campo `messages`. Cadastre os templates com os **mesmos nomes** de
`wa_templates.name` (`pedido_recebido`, `confirmacao_agendamento`, `lembrete_24h`...), idioma `pt_BR`, com **parâmetros
nomeados** (`{{nome}}`, `{{pet}}`...) e botões de resposta rápida `Confirmar` / `Remarcar` / `Cancelar`.

**Fluxo de confirmação**
1. O tutor pede (`create_booking`). A reserva fica `pendente` e a mensagem `pedido_recebido` fica `enviando`.
2. O prestador aceita (`update_booking_status → aguardando_cliente`). O adaptador chama `whatsapp-send` com
   `{ bookingId, template: 'confirmacao_agendamento' }` se `auto_confirmation_request` estiver ligado. O template é preenchido no servidor.
3. O tutor toca **Confirmar** (ou responde "SIM"). O webhook valida a assinatura, deduplica pelo wamid, grava a mensagem e
   chama `wa_apply_confirmation`. A reserva vira `confirmado` e a conversa vira `agendado`. **Remarcar** volta para `pendente`
   (o SLA reabre) e **Cancelar** cancela e devolve a sessão do pacote. **Parar de receber** revoga o `marketing_opt_in`.
4. A reserva-alvo é a do contexto (a resposta aponta o wamid do template). Na falta dele, vale a da conversa ou a mais recente
   aguardando aquele cliente.

**Despachante de mensagens pendentes** (`delivery = 'enviando'`, por exemplo a `pedido_recebido`): crie um *Database Webhook*
(Dashboard → Database → Webhooks) em `public.messages` / INSERT apontando para `whatsapp-send`, com o cabeçalho
`Authorization: Bearer <service_role>`. A function aceita o payload padrão `{ type, table, record }` ou `{ messageId }`.

`whatsapp-send` também aplica: consentimento (`wa_opt_in` para utility e `marketing_opt_in` para marketing), janela de 24 h
(texto livre só se o cliente escreveu nas últimas 24 h; fora dela, só template) e um rate limit simples por prestador.

---

## 4. Produção no Supabase

```bash
supabase link --project-ref <ref>
supabase db push            # aplica migrations; NÃO roda seed
```

- Auth → URL Configuration: Site URL e Redirect URLs do domínio real. Configure SMTP próprio.
- Auth: deixe o login por senha desligado para usuários comuns (o app usa OTP/magic link) ou exija senha forte. Ative CAPTCHA.
- Storage: os buckets `pet-photos` (privado) e `provider-media` (público) já são criados pela migration.
- Realtime: a migration adiciona `bookings`, `conversations`, `messages`, `reviews` e `package_purchases` à publicação `supabase_realtime`.
- Rode o *Security Advisor* e o *Performance Advisor* do Dashboard depois do primeiro push.

---

## 5. Firebase

### 5.1 Criar o projeto
1. Console Firebase → novo projeto (região do Firestore: `southamerica-east1`).
2. **Authentication**: ative *Email link (passwordless)*. Ative *Email/Password* só num projeto de demonstração.
3. **Firestore** no modo nativo, e **Storage**.
4. Registre um app Web e copie a config para `VITE_FIREBASE_*` em `apps/web/.env.local`.
5. `firebase use --add` e troque os IDs de exemplo do `.firebaserc`.

### 5.2 Publicar regras e índices
```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

### 5.3 Hosting (serve o build do Vite com SPA rewrite e cabeçalhos de segurança)
```bash
cd apps/web && npm run build && cd ../..
npx firebase-tools deploy --only hosting
```
A CSP de `firebase.json` libera `*.supabase.co` e os domínios do Google, então o hosting serve tanto o backend Supabase quanto o
Firebase. O build `--mode single` (vite-plugin-singlefile) embute os scripts inline e é **incompatível** com `script-src 'self'`.
Use o build normal no hosting.

### 5.4 Dados iniciais do Firebase
O seed gerado é só para o Supabase. No Firebase, crie pelo Admin SDK ou pelo console:
- a coleção `templates` (mesmo conteúdo de `wa_templates`);
- prestadores publicados (`status: 'publicado'`), que só o servidor/admin pode publicar;
- os usuários demo no Auth, se quiser `signInDemo`.

Um prestador também pode se cadastrar pelo app (`registerProvider`). Ele entra `em_analise`.

### 5.5 Emuladores e teste automatizado
```bash
# precisa de Java 11+; firebase-tools NÃO é dependência do app
VITE_FIREBASE_USE_EMULATOR=true ...   # no .env.local para o app apontar para os emuladores
npx firebase-tools emulators:exec --only firestore,auth --project demo-cuidope "node tests/firebase/adapter-e-rules.mjs"
```
O teste carrega o `firebaseAdapter.ts` real via Vite SSR e roda o fluxo completo: busca anônima → login demo → pet → reserva →
aceite → confirmação → conclusão → avaliação → resposta. Ele também tenta **burlar** as rules via REST com o token do usuário
(alterar preço/status/nota, forjar reserva, ler dados de terceiros, se promover a prestador). São 40 verificações.

---

## 6. Trocar o backend no front

```dotenv
# apps/web/.env.local
VITE_DATA_BACKEND=supabase   # demo | supabase | firebase
```

```ts
// exemplo de seleção dinâmica (cada SDK só entra no bundle quando usado)
const backend = import.meta.env.VITE_DATA_BACKEND ?? 'demo';
const repo =
  backend === 'supabase' ? (await import('./supabaseAdapter')).createSupabaseRepository()
  : backend === 'firebase' ? (await import('./firebaseAdapter')).createFirebaseRepository()
  : /* demo */ createDemoRepository();
```
Reinicie o `vite` depois de alterar `.env.local`.

---

## 7. Limitações conhecidas

**Supabase**
- O `supabaseAdapter.ts` foi verificado com `tsc` (strict). Ele **não** foi executado contra PostgREST/GoTrue reais neste
  ambiente, porque não havia `supabase start`/Docker. A camada SQL (migration, seed, RLS e RPCs) foi testada em PostgreSQL 16 e no PGlite.
- `availableSlots` para visitante anônimo não consulta a ocupação (`busy_slots` é só para autenticados). O servidor revalida na criação.
- A mensagem `pedido_recebido` depende do Database Webhook (seção 3) para sair de fato.
- O fuso de negócio é fixo em `America/Sao_Paulo` (todas as cidades atuais estão no mesmo fuso).
- `delete_my_account()` anonimiza os dados. A remoção do registro em `auth.users` precisa de uma function admin (não incluída).

**Firebase** (adaptador "caminho feliz")
- Sem Cloud Functions: não há checagem de capacidade, compra ou consumo de pacote (`createBooking` com pacote retorna
  `indisponivel`), recálculo de nota, envio real de WhatsApp (as mensagens ficam `enviando`) nem webhook.
- As conversas do CRM só existem se forem criadas por um processo de servidor.
- `stats().bookings` vale 0 (reservas não são públicas). Avaliações são públicas mesmo de prestadores não publicados.
- O prestador lê os clientes e pets que o vincularam ao reservar (`linkedProviderUids`). O tutor pode revogar.
