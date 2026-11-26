import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const T = "Termos de Uso — NATV";
const D = "Condições de uso do serviço de streaming multimídia e suporte NATV.";
export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [{ title: T }, { name: "description", content: D }, { property: "og:title", content: T }, { property: "og:description", content: D }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" }, { property: "og:url", content: "https://administrativotop.lovable.app/termos" }],
    links: [{ rel: "canonical", href: "https://administrativotop.lovable.app/termos" }],
  }),
  component: Termos,
});

function Termos() {
  return (
    <LegalPage title="Termos de Uso" updated="26/11/2026">
      <section><h2>1. O serviço</h2><p>A NATV oferece acesso por assinatura a um serviço de streaming multimídia, com configuração e suporte ao cliente pelo WhatsApp. Não vendemos aparelhos e não somos responsáveis por conteúdo de terceiros.</p></section>
      <section><h2>2. Demonstração e assinatura</h2><p>Antes de assinar, você pode solicitar uma demonstração sem compromisso. A assinatura é paga via PIX, nos planos mensal, trimestral ou semestral, conforme os valores informados no momento do pagamento.</p></section>
      <section><h2>3. Uso permitido</h2><ul><li>O acesso é pessoal e não pode ser revendido ou compartilhado publicamente.</li><li>É proibido tentar burlar, copiar ou redistribuir o serviço.</li><li>Você é responsável por manter seu usuário e senha em sigilo.</li></ul></section>
      <section><h2>4. Compatibilidade</h2><p>O serviço funciona em Smart TVs compatíveis, Android TV, Fire TV Stick, Roku, celulares e computadores. A qualidade depende da sua conexão com a internet.</p></section>
      <section><h2>5. Cancelamento</h2><p>Não há fidelidade nem multa. Se não renovar, o acesso termina ao fim do período pago.</p></section>
      <section><h2>6. Disponibilidade</h2><p>Trabalhamos para manter o serviço estável, mas podem ocorrer interrupções por manutenção ou por fatores fora do nosso controle.</p></section>
      <section><h2>7. Contato</h2><p>Dúvidas e solicitações são atendidas pelo nosso WhatsApp oficial, informado na página onde você nos encontrou.</p></section>
    </LegalPage>
  );
}
