import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/coming-soon";
import { Orders } from "@/components/admin/legacy";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Admin NATV" }, { name: "description", content: "Pedidos no painel NATV." }, { property: "og:title", content: "Pedidos — Admin NATV" }, { property: "og:description", content: "Pedidos no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <><PageTitle title="Pedidos" /><Orders /></>,
});
