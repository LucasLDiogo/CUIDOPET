# Cuidopê — metodologia de experiência (UX)

Base usada para desenhar o site/app. Serve para validar com usuários reais antes de investir em produção.

## Personas
| Persona | Contexto | O que precisa | Medo principal |
|---|---|---|---|
| **Ana, tutora que trabalha fora** (34, Passo Fundo) | Golden de 32 kg e gata tímida; viaja a trabalho | Achar alguém confiável perto de casa, rápido, e ver quem já contratou | Deixar o pet com um desconhecido |
| **Carla, dona de pet house** (autônoma) | 6 vagas, 40 clientes, tudo no WhatsApp pessoal | Parar de perder pedido no meio das conversas; confirmar e lembrar sem esforço | Furo de agenda e cliente que não aparece |
| **Diego, dog walker** (iniciante) | Começando, sem avaliações | Ser encontrado sem pagar anúncio; montar pacotes | Ficar invisível na busca |
| **Banho & Bossa, pet shop** (empresa, 4 groomers) | Agenda cheia, vários atendentes | Fila de atendimento organizada, SLA, histórico do cliente | Cliente esperando resposta e indo para o concorrente |

## Jornada do tutor (público)
1. **Descobrir** — início com busca por serviço + cidade + espécie; categorias; destaques da cidade; prova social (avaliações verificadas).
2. **Comparar** — lista ou mapa (bairro aproximado, nunca endereço); filtros de bairro, porte, nota, preço, verificados, pacotes; cada card diz *por que aparece*.
3. **Decidir** — perfil com serviços e preços, pacotes com economia, avaliações (distribuição, aspectos, filtros, respostas do prestador), verificações, horários, política de cancelamento, WhatsApp só se o prestador autorizou.
4. **Pedir** — 4 etapas: serviço/pacote → pet (ficha vai junto; incompatíveis bloqueados com motivo) → dia e horário livres → contato + consentimentos separados (WhatsApp transacional × ofertas).
5. **Acompanhar** — linha do tempo + espelho do WhatsApp com os mesmos botões (Confirmar · Remarcar · Cancelar).
6. **Pós-serviço** — avaliação com nota geral e 3 aspectos (pontualidade, cuidado, comunicação), janela de 14 dias, 1 por atendimento.

## Jornada do prestador
1. **Entrar** — cadastro em 2 minutos (nome, categorias, bairro, WhatsApp, plano) → perfil “em análise” até verificar identidade.
2. **Montar a vitrine** — serviços (preço, unidade, duração, espécies, portes, comissão estimada), pacotes (sessões, validade, desconto sugerido), perfil público e horários.
3. **Receber** — pedido chega no painel e no CRM com a ficha do pet; contador de SLA.
4. **Aceitar → confirmar** — “Aceitar e pedir confirmação” envia o modelo `confirmacao_agendamento`; status do pedido vira *Aguardando cliente*; resposta “Confirmar” vira *Confirmado* e a conversa vai para *Agendado*.
5. **Atender** — check-in (tutor avisado) → concluir (pedido de avaliação automático).
6. **Reter** — clientes sumidos, horários livres para oferecer, saldo de pacotes, responder avaliações.

## Estados da conversa (CRM WhatsApp)
`Novo contato` → `Aguardando atendimento` (relógio do SLA) → `Aguardando cliente` → `Agendado` → `Resolvido`. Visível como caixa de entrada (ordenada por urgência) ou funil (arrastar entre colunas).

## Estados do agendamento
`Pendente (novo pedido)` → `Aguardando cliente` → `Confirmado` → `Em atendimento` → `Concluído`; saídas: `Recusado`, `Cancelado`, `Não compareceu`. As transições permitidas são as mesmas no front (`domain/rules.ts`), na demo e no banco (`supabase/migrations`).

## Princípios aplicados
- Mobile primeiro: barra inferior de app, botões de ação fixos, sem rolagem horizontal (testado em iPhone 13).
- Transparência: motivo do ranking, “novo” em vez de nota inventada, destaque pago não altera nota.
- Privacidade por padrão: bairro em vez de endereço; WhatsApp do prestador só com opt-in; ficha do pet só para quem recebeu o pedido.
- Estados vazios que explicam o que fazer; erros em português dizendo como corrigir.
- Acessibilidade: foco visível, rótulos em todos os campos, contraste nos dois temas, respeito a `prefers-reduced-motion`.

## Validação sugerida (antes da produção)
- 5 tutores e 5 prestadores reais fazendo as tarefas: “agende um passeio para sábado”, “aceite o pedido e confirme pelo WhatsApp”, “crie um pacote de 10 passeios”.
- Métricas: taxa pedido→confirmado, tempo de 1ª resposta, faltas após lembrete, % de atendimentos avaliados.
