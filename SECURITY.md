# Segurança e privacidade — Cuidopê

Documento vivo. Descreve o modelo de ameaças, os controles implementados (Supabase, Firebase e Edge Functions),
o tratamento de dados pessoais segundo a LGPD (Lei 13.709/2018) e o que ainda falta para produção.
Para reportar vulnerabilidades: **seguranca@cuidope.app** (defina a caixa real antes do lançamento). Não abra issue pública.

---

## 1. Ativos e atores

**Ativos:** dados de tutores (nome, telefone, e-mail, bairro), dados de pets (rotina, saúde, temperamento), agenda e valores
das reservas, conversas do WhatsApp, reputação (avaliações), credenciais da Meta/WhatsApp e chaves do Supabase/Firebase.

**Atores:** visitante anônimo · tutor · prestador (dono de um provider) · operador da plataforma (service_role/admin) ·
Meta (webhook) · atacante externo (bots, scraping, fraude) · prestador mal-intencionado (tenta ver clientes de concorrentes).

## 2. Modelo de ameaças (resumo)

| # | Ameaça | Controle implementado |
|---|---|---|
| T1 | IDOR: ler ou alterar reserva, pet ou cliente de outra pessoa | RLS deny-by-default em **todas** as tabelas; policies por `(select auth.uid())`; Firestore rules por `request.auth.uid` |
| T2 | Adulterar preço, status, saldo de pacote ou nota pelo cliente | sem GRANT de INSERT/UPDATE em `bookings`, `package_purchases` e `reviews`; GRANT por **coluna** nas tabelas editáveis; mudanças via RPC `SECURITY DEFINER` (`search_path = ''`) que valida dono e transição; no Firestore, `diff().affectedKeys()` + preço = serviço × unidades |
| T3 | Avaliação falsa ou inflada | só por `submit_review`: reserva **concluída**, do próprio tutor, 1 por reserva (UNIQUE `booking_id` / doc id = bookingId), janela de 14 dias; nota recalculada por trigger, nunca enviada pelo cliente |
| T4 | Escalada de privilégio (virar prestador ou admin) | o papel nunca vem de `raw_user_meta_data` (editável pelo usuário), só de `app_metadata` ou de `register_provider` (entra `em_analise`); status, plano, destaque e verificação não têm GRANT |
| T5 | Webhook forjado ou replay | `X-Hub-Signature-256` = HMAC-SHA256(corpo **bruto**, `WA_APP_SECRET`) com comparação em tempo constante; idempotência por wamid em `wa_webhook_events` |
| T6 | Vazamento de segredo no bundle | só `VITE_SUPABASE_ANON_KEY` (publishable) e a config pública do Firebase vão ao navegador; o adaptador **recusa** chave `service_role`/`sb_secret_`; o token da Meta fica só em secrets das functions |
| T7 | Abuso de envio (spam no WhatsApp) | `whatsapp-send` exige JWT + dono da conversa, consentimento por categoria, janela de 24 h e rate limit por prestador |
| T8 | Overbooking por concorrência | `pg_advisory_xact_lock` por prestador+categoria + checagem de capacidade dentro da transação |
| T9 | Scraping de contatos | view `v_public_providers` sem `owner_user_id`; WhatsApp só com opt-in; anon sem GRANT em customers/pets/bookings/messages; avaliações com nome + inicial |
| T10 | XSS / clickjacking / sniffing | React escapa por padrão; CSP sem `unsafe-inline` em scripts; `frame-ancestors 'none'` + `X-Frame-Options: DENY`; `nosniff` |
| T11 | Upload malicioso ou fora da pasta | buckets com limite de 5 MB e MIME de imagem; policy `foldername(name)[1] = auth.uid()`; `pet-photos` privado |
| T12 | Recursão ou custo de RLS | helpers `app.my_provider_ids()` / `app.my_customer_ids()` (definer, stable) + índices nas FKs |

## 3. Matriz de acesso (Supabase — RLS + GRANTs)

Legenda: **R** lê · **W** escreve direto (colunas limitadas) · **RPC** só via função · — negado.

| Tabela | anon | tutor | prestador (dono) | service_role |
|---|---|---|---|---|
| categories, cities | R | R | R | tudo |
| profiles | — | R/W próprio (`full_name`) | R/W próprio | tudo |
| providers | R publicados (sem `owner_user_id`) | R publicados | R próprio + W perfil (nome, bio, horários, opt-in...) | tudo |
| v_public_providers | R | R | R | R |
| provider_settings | — | — | R/W próprio (sem `wa_connected`) | tudo |
| services | R ativos de publicados | R ativos + os das próprias reservas | R/W/D próprios | tudo |
| service_packages | R ativos de publicados | R ativos + os comprados | R/W/D próprios (sem `sold_count`, `full_price_cents`) | tudo |
| reviews | R publicadas de publicados | R + **RPC** `submit_review` | R próprias + **RPC** `reply_review` | tudo |
| customers | — | R/W próprio (contato, consentimentos) | R da carteira (`provider_customers`) | tudo |
| provider_customers | — | — | R própria | tudo |
| pets | — | R/W/D próprios (`owner_id` imutável) | R dos clientes da carteira | tudo |
| bookings | — | R próprias + **RPC** create/cancel/reply | R próprias + **RPC** status/remarcar/manual | tudo |
| booking_pets, booking_events | — | R (herda bookings) | R (herda bookings) | tudo |
| package_purchases | — | R próprias (escrita via `create_booking`) | R próprias | tudo |
| favorites | — | R/W/D próprios | — | tudo |
| conversations | — | — | R + W `status`/`tags`/`unread`/`assigned_to` | tudo |
| messages | — | — | R (inserção só pelas functions) | tudo |
| wa_templates | — | R globais | R globais + próprios | tudo |
| wa_webhook_events | — | — | — | tudo |
| storage `pet-photos` | — | R/W na pasta `<uid>/` | — | tudo |
| storage `provider-media` | R | R + W na pasta `<uid>/` | R + W na pasta `<uid>/` | tudo |

`EXECUTE` foi revogado de `PUBLIC`/`anon`/`authenticated` em todas as funções. Ele foi concedido a `authenticated` apenas nas
RPCs listadas em `docs/backend-supabase-firebase.md`. Exceções: `public_stats()` também para `anon` (só agregados) e
`wa_apply_confirmation()`/`wa_template_vars()` só para `service_role`.

**Verificação automatizada:** `supabase/tests/10_rls_e_regras.sql` (93 asserts; roda em PostgreSQL e PGlite) e
`tests/firebase/adapter-e-rules.mjs` (40 asserts no emulador, incluindo tentativas de burlar as rules via REST).

## 4. LGPD

### 4.1 Papéis e bases legais (art. 7º)
O Cuidopê é **controlador** dos dados de cadastro, busca e avaliações. Cada prestador é **controlador** dos dados de
atendimento dos próprios clientes (CRM), e o Cuidopê atua como **operador** nesse tratamento. Isso precisa constar nos Termos
e no contrato com o prestador.

| Finalidade | Dados | Base legal |
|---|---|---|
| Criar conta, reservar, executar o serviço, mensagens transacionais | nome, e-mail, telefone, pets, reservas | execução de contrato (art. 7º, V) |
| Mensagens **transacionais** no WhatsApp (confirmação, lembrete) | telefone, nome, dados da reserva | execução de contrato + opt-in exigido pela política da Meta (`wa_opt_in`, `wa_opt_in_at`) |
| Mensagens de **marketing** (vaga liberada, reativação) | telefone, nome | **consentimento** (art. 7º, I), separado e opcional (`marketing_opt_in`, `marketing_opt_in_at`) |
| Avaliações públicas | primeiro nome + inicial, nome do pet, nota, texto | execução de contrato / legítimo interesse (transparência do marketplace), com aviso no formulário |
| Segurança, antifraude, logs | IDs técnicos, eventos | legítimo interesse (art. 7º, IX), com teste de balanceamento documentado |
| Registros fiscais e financeiros | valor e data da reserva | obrigação legal (art. 7º, II) |

Saúde do pet não é dado pessoal sensível do titular. Mesmo assim, as notas de cuidado são tratadas como confidenciais.

### 4.2 Consentimento WhatsApp: transacional × marketing
- Dois campos independentes, cada um com data: `wa_opt_in` (transacional) e `marketing_opt_in` (ofertas). O checkout envia os dois
  separadamente (`NewBookingInput.contact`), e nenhum vem marcado por padrão para marketing.
- `whatsapp-send` bloqueia template `utility` sem `wa_opt_in` e template `marketing` sem `marketing_opt_in`.
- Revogação: botão/texto **"Parar de receber"** no WhatsApp zera `marketing_opt_in` (webhook). O titular também pode mudar no perfil.
- Contato novo que escreve primeiro no WhatsApp entra **sem** consentimento de marketing. A resposta fica limitada à janela de 24 h.

### 4.3 Minimização
- Avaliação mostra "Ana R." (primeiro nome + inicial). `customer_id` não fica em `reviews`, porque a autoria é verificada pela reserva.
- Localização do prestador com 3 casas decimais (aproximadamente 100 m, nível de bairro). Nunca o endereço.
- WhatsApp do prestador só aparece com opt-in. Telefones mascarados em listas (`maskPhone`).
- O webhook guarda só `{id, type, context}` do evento, não o payload inteiro. Os logs das functions não registram telefone completo nem texto.
- O prestador só enxerga clientes vinculados a ele (reserva, conversa ou pacote).

### 4.4 Direitos do titular (art. 18)
- **Acesso e portabilidade:** `getMe()` + `listMyBookings()` + `listMyPackages()` (falta exportar em JSON/CSV pela tela).
- **Correção:** o tutor edita nome, contato e consentimentos (GRANT de coluna em `customers`).
- **Eliminação:** `delete_my_account()` apaga favoritos e pets sem reserva ativa, anonimiza o `customer` (nome "Cliente removido",
  sem telefone/e-mail, consentimentos desligados) e desvincula o login. Reservas e valores ficam anonimizados para obrigação fiscal.
  Pendência: remover o usuário de `auth.users` pela Admin API (function admin).
- **Revogação do consentimento:** a qualquer momento, com efeito imediato nos envios.

### 4.5 Retenção (proposta — validar com o jurídico)
| Dado | Prazo | Como |
|---|---|---|
| Reservas e valores | 5 anos após o fim do exercício (obrigações fiscais) | anonimizar o titular depois da exclusão da conta |
| Mensagens do CRM | 12 meses após a última interação | job `pg_cron` (a criar) |
| `wa_webhook_events` | 30 dias | job `pg_cron` (a criar) |
| Logs de acesso à aplicação | 6 meses (Marco Civil, art. 15) | logs da plataforma |
| Contas inativas sem reservas | 24 meses → aviso → exclusão | job (a criar) |
| Fotos de pets | até a exclusão do pet ou da conta | policy do bucket + job de limpeza |

### 4.6 Suboperadores e transferência internacional (art. 33)
Supabase (infraestrutura em nuvem), Google Firebase e Meta (WhatsApp Business Platform). Escolha região em São Paulo quando
houver, assine os DPAs/cláusulas contratuais e liste os suboperadores na Política de Privacidade.

### 4.7 Incidentes
Plano de resposta com o encarregado (DPO) nomeado. Comunique ANPD e titulares no prazo regulamentar
(Resolução CD/ANPD nº 15/2024: 3 dias úteis a partir do conhecimento, para incidentes com risco ou dano relevante). Faça rotação imediata de
chaves (service_role, `WA_TOKEN`, `WA_APP_SECRET`).

## 5. Cabeçalhos HTTP (Firebase Hosting — `firebase.json`)
- `Content-Security-Policy`: `default-src 'self'`; `script-src 'self'`; `connect-src` só Supabase/Google; `frame-ancestors 'none'`;
  `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `upgrade-insecure-requests`.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` (login do Firebase) · `Cross-Origin-Resource-Policy: same-site`
- Cache longo e imutável em `/assets/**`. `no-cache` em HTML, manifest e service worker.

## 6. Segredos

| Segredo | Onde vive | Nunca |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ambiente das Edge Functions (injetado) | front, repositório, logs |
| `WA_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` | `supabase secrets` | front, repositório |
| Senha dos usuários demo | seed local + `VITE_DEMO_PASSWORD` só em ambiente de demo | produção |
| Config pública do Firebase / anon key | `.env.local` (pública por design: a proteção é RLS/rules) | — |

`supabase/.env` e `apps/web/.env.local` não devem ser versionados (ver `supabase/.gitignore`).

## 7. Webhooks
- Corpo **bruto** assinado (HMAC-SHA256 com o App Secret), comparação em tempo constante. Sem assinatura ou com assinatura inválida a resposta é 401.
- Responde 200 rápido e processa em segundo plano (`EdgeRuntime.waitUntil`). O corpo é limitado a 1 MB.
- Idempotência: cada `wamid` (e `wamid:status`) é processado uma vez.
- GET de verificação com comparação constante do `hub.verify_token` e `hub.challenge` validado.

## 8. O que ainda falta para produção
- [ ] **Painel/admin** (papel de moderador): publicar/suspender prestador, verificar documentos, moderar avaliações (`status = 'oculta'`), com trilha de auditoria.
- [ ] **Pagamentos** (PSP com split e repasse ao prestador). Hoje só se calcula preço e comissão.
- [ ] Database Webhook ou cron do despachante (`delivery = 'enviando'`) e lembretes de 24 h/2 h (`pg_cron`).
- [ ] Jobs de retenção (seção 4.5) e exportação de dados do titular.
- [ ] Function admin para apagar `auth.users` depois de `delete_my_account()`.
- [ ] Rate limit robusto (Redis/Upstash ou tabela dedicada) também nas RPCs de criação de reserva. CAPTCHA (Turnstile/hCaptcha) no OTP e no cadastro.
- [ ] MFA para contas de prestador. Proteção contra senhas vazadas no Supabase Auth.
- [ ] **Firebase:** Cloud Functions para paridade (capacidade, pacotes, recálculo de nota, envio de WhatsApp, webhook) e App Check.
- [ ] Monitoramento e alertas (erros das functions, 401 do webhook, falhas de entrega), backups/PITR e teste de restauração.
- [ ] Varredura de dependências (CI), pentest externo, RIPD/DPIA e revisão jurídica de Termos, Política de Privacidade e contrato operador/controlador.
- [ ] Aprovação dos templates na Meta e verificação do negócio. Política de qualidade do número.
- [ ] Rotação periódica de chaves e procedimento documentado.
