# Backlog e registro de funcionalidades

> Gerado por `npm run backlog` a partir de `packages/domain/src/flags.ts`. Não editar à mão.
> "Dono" é uma função; atribuir nomes ao iniciar cada frente. Status descreve o repositório hoje, não produção.

## MVP A — descoberta e receita SaaS

| Flag | Funcionalidade | Dono | Status | Padrão | Depende de | Custo operacional | Critério de aceite |
|---|---|---|---|---|---|---|---|
| `search_public` | Busca pública de prestadores | Engenharia | ✅ backend pronto | ligada | `catalog_regions` | Baixo (consultas indexadas; sem motor externo) | UF→cidade dependentes; filtra publicados/habilitados/compatíveis/disponíveis; sem 5★ inventado; vazio explica filtro sem relaxar em silêncio; cursor estável. |
| `catalog_regions` | Regiões e habilitação por cidade/serviço/espécie | Operação | ✅ backend pronto | ligada | — | Baixo (curadoria por cidade) | Somente espécies/serviços habilitados aparecem; "Todos" = ativos; espécie não suportada gera lista de interesse (pendente). |
| `provider_public_profile` | Perfil público do prestador | Produto | ✅ backend pronto | ligada | `search_public` | Baixo | Projeção pública sem dado privado; selos separados (identidade, profissional); avaliações por reserva paga. |
| `accounts_roles` | Conta única com papéis e organizações | Engenharia | 🟡 parcial | desligada | — | Médio (provedor de auth, e-mail/SMS) | Cadastro progressivo; alternância tutor/prestador; MFA admin/financeiro. Hoje: modelo + RLS; falta autenticação (ADR-0002). |
| `provider_onboarding` | Onboarding e publicação do prestador | Trust & Safety | 🟡 parcial | desligada | `accounts_roles` | Alto (revisão humana + custo de verificação) | Etapas salvas; revisão com motivos; publicação exige identidade verificada. Hoje: submit/review no banco; falta UI e verificador hospedado. |
| `identity_verification` | Verificação de identidade hospedada | Trust & Safety | ⬜ planejado | desligada | `provider_onboarding` | Alto (tarifa por análise) | Guardar apenas referência/status/escopo/validade; biometria só com fundamento do art. 11 e alternativa. |
| `favorites` | Favoritos | Produto | ⬜ planejado | desligada | `accounts_roles` | Baixo | Favoritar não autoriza marketing nem propostas. |
| `pets` | Pets e plano de cuidado | Produto | 🟡 parcial | desligada | `accounts_roles` | Baixo | Dados privados do tutor; prestador só recebe snapshot após reserva confirmada. Hoje: modelo/RLS testados; falta API/UI. |
| `requests_quotes` | Solicitações e propostas versionadas | Engenharia | ✅ backend pronto | desligada | `pets`, `provider_public_profile` | Baixo | Total derivado dos itens; nova versão invalida a anterior; aceite idempotente revalida pet/oferta/disponibilidade. Falta exposição HTTP autenticada. |
| `chat_internal` | Chat interno | Engenharia | 🟡 parcial | desligada | `requests_quotes` | Médio (moderação, retenção, realtime) | Somente participantes; remetente não forjável; bloqueio efetivo; anexos escaneados (pendente); realtime (pendente). |
| `external_links` | Site externo e WhatsApp autorizados | Produto | 🟡 parcial | desligada | `provider_public_profile` | Baixo | Opt-in do prestador; HTTPS; sem SSRF; clique ≠ venda. Hoje: flags e coluna privada; falta saída transparente na UI. |
| `agenda_capacity` | Agenda e capacidade | Engenharia | 🟡 parcial | desligada | `requests_quotes` | Médio | Sem dupla venda; recurso compartilhado entre hospedagem/passeio; exceções e bloqueios. Falta aplicar regras semanais/buffers e teste de concorrência em Postgres multiconexão. |
| `subscription_saas` | Plano profissional (assinatura) | Financeiro | 🟡 parcial | desligada | `psp_billing` | Médio (taxas do PSP) | Entitlements no servidor; past_due com tolerância; cancelamento sem apagar histórico. Hoje: limites no banco e confirmação de pagamento; falta checkout. |
| `psp_billing` | Cobrança da plataforma via PSP (fluxo A) | Financeiro | 🟡 parcial | desligada | — | Médio | Conta da plataforma é o beneficiário; webhook assinado, idempotente, fora de ordem seguro. Hoje: sandbox; PSP real exige contrato. |
| `provider_metrics` | Métricas agregadas do prestador | Produto | ⬜ planejado | desligada | `search_public` | Médio (eventos e agregação) | Sem lista nominal de visitantes; limiar de 10 indivíduos; definições publicadas. |
| `analytics_events` | Eventos de analytics minimizados | Engenharia | ⬜ planejado | desligada | `consent_management` | Médio | Sem PII; opcionais só com consentimento; retenção 90d bruto / 13m agregado (a validar). |
| `consent_management` | Consentimentos por finalidade/canal | Jurídico | 🟡 parcial | desligada | `accounts_roles` | Baixo | Opt-in separado; revogação efetiva; reavaliado no envio. Hoje: tabelas/RLS e regras de limite no domínio. |
| `authorized_proposals` | Receber propostas compatíveis (premium) | Produto | 🟡 parcial | desligada | `consent_management`, `subscription_saas` | Médio (mensageria) | Sem consentimento não há abordagem, mesmo premium; limites 72h/3 prestadores/1 lembrete; kill switch. Regras testadas no domínio; falta fila de envio. |
| `support_tickets` | SAC, tickets e denúncias | Operação | 🟡 parcial | desligada | `accounts_roles` | Alto (equipe e horário de cobertura) | Protocolo imediato; denunciante oculto; urgência sem promessa fictícia. Falta console de atendimento e canais reais. |
| `moderation_admin` | Administração e moderação | Trust & Safety | 🟡 parcial | desligada | `accounts_roles` | Alto | Ações auditadas, dupla aprovação em reembolso/override, sem impersonação silenciosa. Falta apps/admin. |
| `cms_faq` | CMS e FAQ versionados | Produto | ⬜ planejado | desligada | — | Baixo | FAQ com versão, categoria, dono e revisão. |
| `ads_manual` | Publicidade manual (banners identificados) | Comercial | ⬜ planejado | desligada | `psp_billing` | Médio (comercial + revisão de criativos) | Rótulo "Publicidade"; sem anúncio em emergência/checkout/disputa; conflito competitivo checado. |
| `sponsored_results` | Resultados patrocinados (até 2 por página) | Comercial | ⬜ planejado | desligada | `search_public`, `ads_manual` | Médio | Mesmos filtros; não altera nota/selo; incompatível nunca aparece; registra ranking_version/sponsored/impression_id. |

## MVP B — transações dentro da plataforma

| Flag | Funcionalidade | Dono | Status | Padrão | Depende de | Custo operacional | Critério de aceite |
|---|---|---|---|---|---|---|---|
| `booking_payments` | Pagamento de reservas (fluxo B) | Financeiro | 🟡 parcial | desligada | `requests_quotes`, `agenda_capacity`, `support_tickets` | Alto (taxas, conciliação, suporte) | Reserva só confirma com pagamento elegível e capacidade; pagamento tardio sem vaga vira exceção; ledger balanceado. Falta PSP com recebedor/split. |
| `payout_accounts` | Recebedores e repasses | Financeiro | ⬜ planejado | desligada | `booking_payments` | Alto | KYC do recebedor; troca bancária com MFA e revisão antifraude; repasse conforme capacidades do PSP. |
| `refunds_disputes` | Cancelamento, reembolso e disputa | Financeiro | ⬜ planejado | desligada | `booking_payments` | Alto | Instrução idempotente ao PSP; ledger reverso; chargeback sem apagar histórico; dupla aprovação acima do limite. |
| `care_execution` | Check-in/out, relatório de cuidado e emergências | Produto | 🟡 parcial | desligada | `booking_payments` | Médio | Evidências mínimas; incidente vinculado à reserva; emergência não espera análise financeira. Hoje: progressão de estados guardada. |
| `reviews` | Avaliações de reserva paga | Trust & Safety | ✅ backend pronto | desligada | `care_execution` | Médio (moderação) | Só tutor, reserva concluída e paga, uma por reserva, janela de 14 dias; nota não depende de plano. Falta publicação bilateral e detecção de fraude. |

## V1

| Flag | Funcionalidade | Dono | Status | Padrão | Depende de | Custo operacional | Critério de aceite |
|---|---|---|---|---|---|---|---|
| `team_accounts` | Equipes de estabelecimentos | Produto | ⬜ planejado | desligada | `accounts_roles` | Médio | Convite/revogação preservando histórico; tutor conhece quem executará. |
| `recurring_care` | Recorrência de cuidados | Produto | ⬜ planejado | desligada | `booking_payments` | Médio | Cada ocorrência conferida em horizonte definido. |
| `mobile_apps` | Apps nativos (Expo) | Engenharia | ⬜ planejado | desligada | `booking_payments` | Alto (lojas, billing nativo) | Billing por loja conforme política vigente; restauração e reconciliação web/lojas; push sem PII. |
| `regional_ads_pacing` | Publicidade regional com pacing | Comercial | ⬜ planejado | desligada | `ads_manual` | Médio | Frequência máx. 3/campanha/sessão; antifraude de clique. |
| `affiliates` | Campanhas de afiliados | Comercial | ⬜ planejado | desligada | `ads_manual` | Baixo | Link identificado; conciliação de atribuição. |

## V2

| Flag | Funcionalidade | Dono | Status | Padrão | Depende de | Custo operacional | Critério de aceite |
|---|---|---|---|---|---|---|---|
| `more_species` | Mais espécies aprovadas | Operação | ⬜ planejado | desligada | `catalog_regions` | Médio | Competência e protocolo próprios por espécie. |
| `pet_transport` | Transporte pet | Produto | ⬜ planejado | desligada | `booking_payments` | Alto | Validação regulatória e seguro contratado. |
| `ai_assistant` | Recursos de IA (opcional) | Produto | ⬜ planejado | desligada | — | Variável (por uso) | Núcleo funciona sem IA; nunca habilitado por padrão. |

