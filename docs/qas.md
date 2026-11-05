# Modo QAS — roteiro de teste (tutor e prestador)

QAS é o ambiente de **homologação**: você usa o app pelo navegador, nos dois papéis, com **dados de demonstração** e **pagamento SANDBOX** (nenhum dinheiro, identidade ou publicação reais).

## Como subir
- Windows: duplo clique em `TESTAR-CUIDOPE.cmd` → opção **1. MODO QAS**. A interface abre em `http://127.0.0.1:3333/qas`.
- Terminal: `npm run qas` (porta padrão 3333; mude com `PORT=...`).
- Para recomeçar do zero: opção **4** do `.cmd` (ou apague a pasta `data/qas-db` com a API parada).

## Como funciona (e o que NÃO é)
- A caixa **"Testando como"** escolhe uma persona de teste. **Não é login**: é um atalho para homologar. Autenticação real é a pendência B-006 (ADR-0002).
- As rotas `/v1/me/*` e a página `/qas` só existem com `CUIDOPE_ENV=qas`. Em produção o servidor se recusa a subir nesse modo.
- Os dados ficam em `data/qas-db`, separados do modo normal de desenvolvimento.

## Personas
| Persona | Papel | Para que serve |
|---|---|---|
| Ana (demo) | Tutora | Tem os pets Thor (cão médio) e Mia (gata pequena) |
| Bruno (demo) | Tutor | Tem a Luna (cão grande) |
| Carla (demo) | Tutora **e** prestadora | Hospedagem domiciliar e passeios em Passo Fundo (2 vagas) |
| Diego (demo) | Prestador | Passeios de 60 min, só cães pequenos e médios |
| Elisa (demo) | Prestadora | Banho e tosa em Porto Alegre |

Carla tem os dois papéis: use **"Agir como tutor / Agir como prestador"** na barra de modo.

## Roteiro A — como quem BUSCA o serviço (Ana)
1. Escolha **Ana**. Em **Buscar**, selecione *Hospedagem domiciliar* e clique em **Buscar**. Esperado: aparece a Carla, com **"Por que apareceu:"** (o motivo do ranking), selo de demonstração e nota.
2. **Ver perfil** → no serviço *Hospedagem domiciliar* clique em **Solicitar este serviço**.
3. Marque o **Thor**, escolha datas **futuras** e veja o aviso **"Há vaga neste período"**. Escreva uma mensagem e **Enviar pedido ao prestador**. Se não houver pet, cadastre no próprio formulário.
4. O pedido aparece em **Meus pedidos**. Troque para o papel prestador (Roteiro B, passos 1–3) e volte como Ana.
5. Em **Meus pedidos → Abrir** veja a **Proposta v1** e clique em **Aceitar proposta e ir para o pagamento**. Esperado: abre **Minhas reservas** com status *Aguardando pagamento*, um **Pix SANDBOX** (código `SANDBOX-PIX-NAO-PAGAVEL-…`, **não pagável**) e uma contagem regressiva de 15 min (a vaga fica retida).
6. Clique em **Simular pagamento aprovado (sandbox)**. Esperado: a reserva vira **Confirmada** e o nome do pet passa a aparecer para a prestadora.
7. Abra **Ferramentas de QA** e clique em **Reenviar o mesmo aviso**. Esperado: `duplicado = sim` (o webhook é idempotente; nada é cobrado duas vezes).
8. Depois que a prestadora concluir o atendimento (Roteiro B, passo 6), volte à reserva, escreva e **Enviar avaliação**. Esperado: *Avaliação publicada* e *Você já avaliou*.

Variações úteis:
- **Expirar reserva agora (teste)** em vez de pagar: a vaga é liberada e o Pix deixa de valer.
- Como Bruno, solicite o passeio do Diego com a Luna (cão grande): deve ser recusado com "O prestador não atende esse porte". Como Carla (modo tutor), tente contratar o próprio serviço: deve ser recusado.
- **Cancelar** um pedido ainda aberto; depois tente aceitar a proposta dele: deve dizer que o pedido foi encerrado.

## Roteiro B — como quem OFERECE o serviço (Carla)
1. Escolha **Carla** e clique em **Agir como prestador**. O **Painel** mostra pedidos, reservas e **Ganhos (estimativa)**.
2. **Pedidos recebidos**: veja *Tutor: Ana (demo)* e o pet **sem o nome** (só "Cão, médio"). Por privacidade, o nome só aparece após o pagamento.
3. **Abrir → Enviar proposta**: informe o local, veja o **total e a comissão** calculados na hora e envie. Esperado: *Proposta enviada ao tutor*. Enviar de novo cria a **v2** (revisão).
4. Opcional: **Recusar** um pedido (o tutor vê "recusado" e não consegue aceitar).
5. Depois do pagamento da Ana, abra **Reservas**: agora aparecem o nome do pet e o status *Confirmada*.
6. Conduza a reserva: **Marcar como pronta → Iniciar atendimento → Concluir atendimento**. Esperado: cada botão só aparece no estado certo; o estado é validado no banco.
7. **Avaliações**: após a avaliação da Ana, **Responder** publicamente. Esperado: *Resposta publicada*.
8. Volte ao **Painel**: *Concluídas* e *Ganhos (estimativa)* refletem a reserva.

## Resultados esperados que valem uma checagem atenta
- **Comissão**: 12% do total, arredondamento *half-up*, em centavos inteiros. Ex.: R$ 120,00 → comissão R$ 14,40 → prestador R$ 105,60.
- **Capacidade**: Carla tem 2 vagas. Com 2 reservas/retenções no mesmo período, o 3º aceite é recusado.
- **Isolamento**: Bruno não vê pedidos nem reservas da Ana; Diego não vê pedidos da Carla.
- **Aceite repetido** (mesma `Idempotency-Key`) devolve o mesmo pedido, sem duplicar.
- **Mobile**: reduza a janela para ~390 px; não deve haver rolagem horizontal.

## Ferramentas de QA (só existem aqui)
| Ferramenta | O que faz |
|---|---|
| Simular pagamento aprovado (sandbox) | Dispara o webhook **assinado** (HMAC) pelo mesmo caminho do PSP real |
| Reenviar o mesmo aviso | Testa idempotência/deduplicação do webhook |
| Expirar reserva agora (teste) | Vence a retenção de vaga sem esperar 15 min |
| Log de chamadas (apoio ao QA) | Painel recolhível no rodapé com as requisições feitas pela interface |

## Limites desta versão (honestos)
- Persona de teste, **não** autenticação. Qualquer pessoa com acesso à porta pode escolher qualquer persona; por isso é só para uso local.
- Pagamento **somente sandbox**; não existe repasse real ao prestador (os ganhos são estimativa).
- **Sem chat** entre tutor e prestador (a negociação é por pedido/proposta).
- O prestador **não gerencia anúncios, preços nem agenda pela interface** (vêm da carga de demonstração).
- Sem verificação de identidade real, notificações, cancelamento com reembolso, denúncias ou painel administrativo.
- A validade da proposta precisa estar no futuro; o formulário de pedido ainda não valida datas passadas (use datas futuras ao testar).

## Se algo não bater
Anote: persona, passo, o que viu e o que esperava, e o texto do **Log de chamadas**. Cada erro de regra vem em português; um erro genérico ("Algo deu errado") é, por si só, um defeito a reportar.
