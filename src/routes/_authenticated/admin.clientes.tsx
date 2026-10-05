import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/coming-soon";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Admin NATV" }, { name: "description", content: "Clientes no painel NATV." }, { property: "og:title", content: "Clientes — Admin NATV" }, { property: "og:description", content: "Clientes no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <ComingSoon title="Clientes" />,
});
