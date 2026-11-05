export type Phase = 'MVP_A' | 'MVP_B' | 'V1' | 'V2';
export type Status = 'backend_pronto' | 'parcial' | 'planejado';
export interface FeatureFlag {
  key: string; title: string; phase: Phase; owner: string; acceptance: string; dependsOn: string[]; opCost: string; status: Status; defaultOn: boolean;
}

/**
 * Registro único de funcionalidades (spec §3): cada uma com flag, dono, critério de aceite, dependências e custo operacional.
 * `docs/backlog.md` é GERADO daqui (npm run backlog) — não editar à mão.
 * "Dono" é uma função, não uma pessoa; atribuir nomes ao iniciar cada frente.
 */
export const FEATURES: readonly FeatureFlag[] = Object.freeze([
  { key: 'search_public', title: 'Busca pública de prestadores', phase: 'MVP_A', owner: 'Engenharia', status: 'backend_pronto', defaultOn: true, dependsOn: ['catalog_regions'],
    acceptance: 'UF→cidade dependentes; filtra publicados/habilitados/compatíveis/disponíveis; sem 5★ inventado; vazio explica filtro sem relaxar em silêncio; cursor estável.', opCost: 'Baixo (consultas indexadas; sem motor externo)' },
  { key: 'catalog_regions', title: 'Regiões e habilitação por cidade/serviço/espécie', phase: 'MVP_A', owner: 'Operação', status: 'backend_pronto', defaultOn: true, dependsOn: [],
    acceptance: 'Somente espécies/serviços habilitados aparecem; "Todos" = ativos; espécie não suportada gera lista de interesse (pendente).', opCost: 'Baixo (curadoria por cidade)' },
  { key: 'provider_public_profile', title: 'Perfil público do prestador', phase: 'MVP_A', owner: 'Produto', status: 'backend_pronto', defaultOn: true, dependsOn: ['search_public'],
    acceptance: 'Projeção pública sem dado privado; selos separados (identidade, profissional); avaliações por reserva paga.', opCost: 'Baixo' },
  { key: 'accounts_roles', title: 'Conta única com papéis e organizações', phase: 'MVP_A', owner: 'Engenharia', status: 'parcial', defaultOn: false, dependsOn: [],
    acceptance: 'Cadastro progressivo; alternância tutor/prestador; MFA admin/financeiro. Hoje: modelo + RLS; falta autenticação (ADR-0002).', opCost: 'Médio (provedor de auth, e-mail/SMS)' },
  { key: 'provider_onboarding', title: 'Onboarding e publicação do prestador', phase: 'MVP_A', owner: 'Trust & Safety', status: 'parcial', defaultOn: false, dependsOn: ['accounts_roles'],
    acceptance: 'Etapas salvas; revisão com motivos; publicação exige identidade verificada. Hoje: submit/review no banco; falta UI e verificador hospedado.', opCost: 'Alto (revisão humana + custo de verificação)' },
  { key: 'identity_verification', title: 'Verificação de identidade hospedada', phase: 'MVP_A', owner: 'Trust & Safety', status: 'planejado', defaultOn: false, dependsOn: ['provider_onboarding'],
    acceptance: 'Guardar apenas referência/status/escopo/validade; biometria só com fundamento do art. 11 e alternativa.', opCost: 'Alto (tarifa por análise)' },
  { key: 'favorites', title: 'Favoritos', phase: 'MVP_A', owner: 'Produto', status: 'planejado', defaultOn: false, dependsOn: ['accounts_roles'], acceptance: 'Favoritar não autoriza marketing nem propostas.', opCost: 'Baixo' },
  { key: 'pets', title: 'Pets e plano de cuidado', phase: 'MVP_A', owner: 'Produto', status: 'parcial', defaultOn: false, dependsOn: ['accounts_roles'],
    acceptance: 'Dados privados do tutor; prestador só recebe snapshot após reserva confirmada. Hoje: modelo/RLS testados; falta API/UI.', opCost: 'Baixo' },
  { key: 'requests_quotes', title: 'Solicitações e propostas versionadas', phase: 'MVP_A', owner: 'Engenharia', status: 'backend_pronto', defaultOn: false, dependsOn: ['pets', 'provider_public_profile'],
    acceptance: 'Total derivado dos itens; nova versão invalida a anterior; aceite idempotente revalida pet/oferta/disponibilidade. Falta exposição HTTP autenticada.', opCost: 'Baixo' },
  { key: 'chat_internal', title: 'Chat interno', phase: 'MVP_A', owner: 'Engenharia', status: 'parcial', defaultOn: false, dependsOn: ['requests_quotes'],
    acceptance: 'Somente participantes; remetente não forjável; bloqueio efetivo; anexos escaneados (pendente); realtime (pendente).', opCost: 'Médio (moderação, retenção, realtime)' },
  { key: 'external_links', title: 'Site externo e WhatsApp autorizados', phase: 'MVP_A', owner: 'Produto', status: 'parcial', defaultOn: false, dependsOn: ['provider_public_profile'],
    acceptance: 'Opt-in do prestador; HTTPS; sem SSRF; clique ≠ venda. Hoje: flags e coluna privada; falta saída transparente na UI.', opCost: 'Baixo' },
  { key: 'agenda_capacity', title: 'Agenda e capacidade', phase: 'MVP_A', owner: 'Engenharia', status: 'parcial', defaultOn: false, dependsOn: ['requests_quotes'],
    acceptance: 'Sem dupla venda; recurso compartilhado entre hospedagem/passeio; exceções e bloqueios. Falta aplicar regras semanais/buffers e teste de concorrência em Postgres multiconexão.', opCost: 'Médio' },
  { key: 'subscription_saas', title: 'Plano profissional (assinatura)', phase: 'MVP_A', owner: 'Financeiro', status: 'parcial', defaultOn: false, dependsOn: ['psp_billing'],
    acceptance: 'Entitlements no servidor; past_due com tolerância; cancelamento sem apagar histórico. Hoje: limites no banco e confirmação de pagamento; falta checkout.', opCost: 'Médio (taxas do PSP)' },
  { key: 'psp_billing', title: 'Cobrança da plataforma via PSP (fluxo A)', phase: 'MVP_A', owner: 'Financeiro', status: 'parcial', defaultOn: false, dependsOn: [],
    acceptance: 'Conta da plataforma é o beneficiário; webhook assinado, idempotente, fora de ordem seguro. Hoje: sandbox; PSP real exige contrato.', opCost: 'Médio' },
  { key: 'provider_metrics', title: 'Métricas agregadas do prestador', phase: 'MVP_A', owner: 'Produto', status: 'planejado', defaultOn: false, dependsOn: ['search_public'],
    acceptance: 'Sem lista nominal de visitantes; limiar de 10 indivíduos; definições publicadas.', opCost: 'Médio (eventos e agregação)' },
  { key: 'analytics_events', title: 'Eventos de analytics minimizados', phase: 'MVP_A', owner: 'Engenharia', status: 'planejado', defaultOn: false, dependsOn: ['consent_management'],
    acceptance: 'Sem PII; opcionais só com consentimento; retenção 90d bruto / 13m agregado (a validar).', opCost: 'Médio' },
  { key: 'consent_management', title: 'Consentimentos por finalidade/canal', phase: 'MVP_A', owner: 'Jurídico', status: 'parcial', defaultOn: false, dependsOn: ['accounts_roles'],
    acceptance: 'Opt-in separado; revogação efetiva; reavaliado no envio. Hoje: tabelas/RLS e regras de limite no domínio.', opCost: 'Baixo' },
  { key: 'authorized_proposals', title: 'Receber propostas compatíveis (premium)', phase: 'MVP_A', owner: 'Produto', status: 'parcial', defaultOn: false, dependsOn: ['consent_management', 'subscription_saas'],
    acceptance: 'Sem consentimento não há abordagem, mesmo premium; limites 72h/3 prestadores/1 lembrete; kill switch. Regras testadas no domínio; falta fila de envio.', opCost: 'Médio (mensageria)' },
  { key: 'support_tickets', title: 'SAC, tickets e denúncias', phase: 'MVP_A', owner: 'Operação', status: 'parcial', defaultOn: false, dependsOn: ['accounts_roles'],
    acceptance: 'Protocolo imediato; denunciante oculto; urgência sem promessa fictícia. Falta console de atendimento e canais reais.', opCost: 'Alto (equipe e horário de cobertura)' },
  { key: 'moderation_admin', title: 'Administração e moderação', phase: 'MVP_A', owner: 'Trust & Safety', status: 'parcial', defaultOn: false, dependsOn: ['accounts_roles'],
    acceptance: 'Ações auditadas, dupla aprovação em reembolso/override, sem impersonação silenciosa. Falta apps/admin.', opCost: 'Alto' },
  { key: 'cms_faq', title: 'CMS e FAQ versionados', phase: 'MVP_A', owner: 'Produto', status: 'planejado', defaultOn: false, dependsOn: [], acceptance: 'FAQ com versão, categoria, dono e revisão.', opCost: 'Baixo' },
  { key: 'ads_manual', title: 'Publicidade manual (banners identificados)', phase: 'MVP_A', owner: 'Comercial', status: 'planejado', defaultOn: false, dependsOn: ['psp_billing'],
    acceptance: 'Rótulo "Publicidade"; sem anúncio em emergência/checkout/disputa; conflito competitivo checado.', opCost: 'Médio (comercial + revisão de criativos)' },
  { key: 'sponsored_results', title: 'Resultados patrocinados (até 2 por página)', phase: 'MVP_A', owner: 'Comercial', status: 'planejado', defaultOn: false, dependsOn: ['search_public', 'ads_manual'],
    acceptance: 'Mesmos filtros; não altera nota/selo; incompatível nunca aparece; registra ranking_version/sponsored/impression_id.', opCost: 'Médio' },
  { key: 'booking_payments', title: 'Pagamento de reservas (fluxo B)', phase: 'MVP_B', owner: 'Financeiro', status: 'parcial', defaultOn: false, dependsOn: ['requests_quotes', 'agenda_capacity', 'support_tickets'],
    acceptance: 'Reserva só confirma com pagamento elegível e capacidade; pagamento tardio sem vaga vira exceção; ledger balanceado. Falta PSP com recebedor/split.', opCost: 'Alto (taxas, conciliação, suporte)' },
  { key: 'payout_accounts', title: 'Recebedores e repasses', phase: 'MVP_B', owner: 'Financeiro', status: 'planejado', defaultOn: false, dependsOn: ['booking_payments'],
    acceptance: 'KYC do recebedor; troca bancária com MFA e revisão antifraude; repasse conforme capacidades do PSP.', opCost: 'Alto' },
  { key: 'refunds_disputes', title: 'Cancelamento, reembolso e disputa', phase: 'MVP_B', owner: 'Financeiro', status: 'planejado', defaultOn: false, dependsOn: ['booking_payments'],
    acceptance: 'Instrução idempotente ao PSP; ledger reverso; chargeback sem apagar histórico; dupla aprovação acima do limite.', opCost: 'Alto' },
  { key: 'care_execution', title: 'Check-in/out, relatório de cuidado e emergências', phase: 'MVP_B', owner: 'Produto', status: 'parcial', defaultOn: false, dependsOn: ['booking_payments'],
    acceptance: 'Evidências mínimas; incidente vinculado à reserva; emergência não espera análise financeira. Hoje: progressão de estados guardada.', opCost: 'Médio' },
  { key: 'reviews', title: 'Avaliações de reserva paga', phase: 'MVP_B', owner: 'Trust & Safety', status: 'backend_pronto', defaultOn: false, dependsOn: ['care_execution'],
    acceptance: 'Só tutor, reserva concluída e paga, uma por reserva, janela de 14 dias; nota não depende de plano. Falta publicação bilateral e detecção de fraude.', opCost: 'Médio (moderação)' },
  { key: 'team_accounts', title: 'Equipes de estabelecimentos', phase: 'V1', owner: 'Produto', status: 'planejado', defaultOn: false, dependsOn: ['accounts_roles'], acceptance: 'Convite/revogação preservando histórico; tutor conhece quem executará.', opCost: 'Médio' },
  { key: 'recurring_care', title: 'Recorrência de cuidados', phase: 'V1', owner: 'Produto', status: 'planejado', defaultOn: false, dependsOn: ['booking_payments'], acceptance: 'Cada ocorrência conferida em horizonte definido.', opCost: 'Médio' },
  { key: 'mobile_apps', title: 'Apps nativos (Expo)', phase: 'V1', owner: 'Engenharia', status: 'planejado', defaultOn: false, dependsOn: ['booking_payments'],
    acceptance: 'Billing por loja conforme política vigente; restauração e reconciliação web/lojas; push sem PII.', opCost: 'Alto (lojas, billing nativo)' },
  { key: 'regional_ads_pacing', title: 'Publicidade regional com pacing', phase: 'V1', owner: 'Comercial', status: 'planejado', defaultOn: false, dependsOn: ['ads_manual'], acceptance: 'Frequência máx. 3/campanha/sessão; antifraude de clique.', opCost: 'Médio' },
  { key: 'affiliates', title: 'Campanhas de afiliados', phase: 'V1', owner: 'Comercial', status: 'planejado', defaultOn: false, dependsOn: ['ads_manual'], acceptance: 'Link identificado; conciliação de atribuição.', opCost: 'Baixo' },
  { key: 'more_species', title: 'Mais espécies aprovadas', phase: 'V2', owner: 'Operação', status: 'planejado', defaultOn: false, dependsOn: ['catalog_regions'], acceptance: 'Competência e protocolo próprios por espécie.', opCost: 'Médio' },
  { key: 'pet_transport', title: 'Transporte pet', phase: 'V2', owner: 'Produto', status: 'planejado', defaultOn: false, dependsOn: ['booking_payments'], acceptance: 'Validação regulatória e seguro contratado.', opCost: 'Alto' },
  { key: 'ai_assistant', title: 'Recursos de IA (opcional)', phase: 'V2', owner: 'Produto', status: 'planejado', defaultOn: false, dependsOn: [], acceptance: 'Núcleo funciona sem IA; nunca habilitado por padrão.', opCost: 'Variável (por uso)' },
]);

export const featureByKey = (k: string) => FEATURES.find((f) => f.key === k);
