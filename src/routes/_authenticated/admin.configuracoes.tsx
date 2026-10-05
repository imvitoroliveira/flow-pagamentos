import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/coming-soon";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Admin NATV" }, { name: "description", content: "Configurações no painel NATV." }, { property: "og:title", content: "Configurações — Admin NATV" }, { property: "og:description", content: "Configurações no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <ComingSoon title="Configurações" />,
});
