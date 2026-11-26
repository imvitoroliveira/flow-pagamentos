import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const T = "Política de Privacidade — NATV";
const D = "Como a NATV coleta, usa e protege seus dados, conforme a LGPD.";
export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [{ title: T }, { name: "description", content: D }, { property: "og:title", content: T }, { property: "og:description", content: D }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" }, { property: "og:url", content: "https://administrativotop.lovable.app/privacidade" }],
    links: [{ rel: "canonical", href: "https://administrativotop.lovable.app/privacidade" }],
  }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <LegalPage title="Política de Privacidade" updated="26/11/2026">
      <p>Esta política explica quais dados tratamos e por quê, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).</p>
      <section><h2>1. Dados que coletamos</h2><ul>
        <li><strong>Contato:</strong> nome, telefone/WhatsApp e e-mail que você informa ao falar conosco ou ao pagar.</li>
        <li><strong>Assinatura:</strong> usuário de acesso, plano, datas e status de pagamento.</li>
        <li><strong>Navegação:</strong> um código de visita, origem do anúncio (por exemplo, parâmetros de campanha), tipo de aparelho e navegador, para medir resultados das campanhas.</li>
      </ul></section>
      <section><h2>2. Ferramentas de terceiros</h2><ul>
        <li><strong>Meta Pixel e API de Conversões (Meta Platforms):</strong> nas páginas de anúncio e pagamento, registram visitas, contatos e compras. O Pixel pode gravar cookies no seu navegador (como _fbp e _fbc). Telefone e e-mail enviados à Meta são criptografados (hash) antes do envio.</li>
        <li><strong>AbacatePay:</strong> processa o pagamento via PIX e recebe os dados necessários para a cobrança.</li>
        <li><strong>WhatsApp:</strong> usado para atendimento e lembretes de renovação.</li>
        <li>Guardamos no seu navegador um código de visita para atribuir corretamente sua compra à campanha de origem.</li>
      </ul></section>
      <section><h2>3. Estatísticas de visitas</h2><p>Também usamos as estatísticas de visitantes da Lovable, plataforma onde o site é hospedado. Elas não usam cookies, não guardam nada no seu aparelho, não mantêm endereços IP e não identificam visitantes. São registradas as páginas visitadas, de onde o visitante veio, país, navegador, sistema operacional, tipo de aparelho, tempo de permanência, velocidade de carregamento e erros. Dados detalhados ficam guardados por 90 dias e resumos diários por um ano. A Lovable coleta esses dados para nós. A <a className="underline" href="https://lovable.dev/privacy" target="_blank" rel="noopener noreferrer">política de privacidade da Lovable</a> explica como ela os trata.</p></section>
      <section><h2>4. Para que usamos</h2><ul><li>Prestar o serviço, liberar e renovar seu acesso.</li><li>Atender você e enviar avisos sobre vencimento.</li><li>Medir e melhorar nossas campanhas.</li></ul><p>Não vendemos seus dados.</p></section>
      <section><h2>5. Seus direitos</h2><p>Você pode pedir acesso, correção ou exclusão dos seus dados, e deixar de receber mensagens, a qualquer momento pelo nosso WhatsApp oficial.</p></section>
      <section><h2>6. Segurança e retenção</h2><p>Os dados ficam em ambiente protegido, com acesso restrito à equipe. Mantemos apenas pelo tempo necessário para o serviço e obrigações legais.</p></section>
    </LegalPage>
  );
}
