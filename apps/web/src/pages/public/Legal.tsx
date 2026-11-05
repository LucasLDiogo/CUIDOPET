export function LegalPage({ kind }: { kind: 'privacidade' | 'termos' }) {
  return (
    <article className="gutter mx-auto max-w-3xl py-12 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:space-y-1.5">
      <div className="eyebrow">Modelo para revisão jurídica</div>
      {kind === 'privacidade' ? (
        <>
          <h1 className="mt-1 text-4xl font-extrabold">Política de Privacidade</h1>
          <p className="text-muted">Texto-base da demonstração, alinhado à LGPD (Lei 13.709/2018). Revise com um advogado antes de publicar.</p>
          <h2>Quais dados usamos e por quê</h2>
          <ul>
            <li><b>Cadastro (nome, e-mail, WhatsApp):</b> para criar a conta e executar o agendamento (execução de contrato, art. 7º, V).</li>
            <li><b>Ficha do pet e observações de cuidado:</b> compartilhadas só com o prestador que você escolher, a partir do pedido.</li>
            <li><b>Mensagens de WhatsApp do atendimento</b> (confirmação, lembrete, pedido de avaliação): só com o seu aceite no agendamento.</li>
            <li><b>Ofertas e vagas liberadas:</b> consentimento separado e opcional (art. 7º, I), revogável a qualquer momento respondendo “parar”.</li>
            <li><b>Registros de acesso:</b> guardados por 6 meses (Marco Civil da Internet, art. 15).</li>
          </ul>
          <h2>O que o prestador vê</h2>
          <p>Seu nome, WhatsApp e a ficha dos pets incluídos no pedido. Endereço exato só quando o serviço é na sua casa e depois da confirmação. Na busca pública mostramos apenas o bairro do prestador, nunca o endereço.</p>
          <h2>Avaliações</h2>
          <p>Só quem concluiu um atendimento pode avaliar, uma vez por agendamento. Publicamos o primeiro nome e a inicial do sobrenome.</p>
          <h2>Seus direitos</h2>
          <p>Acesso, correção, portabilidade, exclusão e revogação de consentimento pelo app ou pelo e-mail do encarregado (DPO): privacidade@cuidope.app (exemplo).</p>
          <h2>Segurança</h2>
          <p>Criptografia em trânsito (HTTPS/HSTS), isolamento de dados por usuário no banco (Row Level Security), segredos de integração apenas no servidor e registro de auditoria das ações sensíveis.</p>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-4xl font-extrabold">Termos de Uso</h1>
          <p className="text-muted">Texto-base da demonstração. Revise com um advogado antes de publicar.</p>
          <h2>O que é o Cuidopê</h2>
          <p>Uma plataforma que aproxima tutores de pets e prestadores independentes (passeadores, cuidadores, pet houses, creches, pet shops, adestradores e veterinários). O serviço é prestado pelo prestador escolhido.</p>
          <h2>Agendamentos</h2>
          <ul>
            <li>O pedido só vira agendamento depois do aceite do prestador e da sua confirmação (no app ou no WhatsApp).</li>
            <li>Cancelamentos seguem a política exibida no perfil do prestador no momento do pedido.</li>
            <li>Pacotes têm validade e saldo mostrados antes da compra.</li>
          </ul>
          <h2>Conduta</h2>
          <p>É proibido publicar avaliações falsas, contatos de terceiros sem autorização ou conteúdo ofensivo. Denúncias são analisadas pela equipe e podem levar à suspensão do perfil.</p>
          <h2>Prestadores</h2>
          <p>Prestadores declaram ter 18 anos ou mais, informam dados verdadeiros e passam por verificação de identidade antes de aparecer na busca.</p>
        </>
      )}
    </article>
  );
}
