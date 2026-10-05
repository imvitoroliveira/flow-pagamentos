import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/coming-soon";
import { Sellers } from "@/components/admin/legacy";

export const Route = createFileRoute("/_authenticated/admin/vendedores")({
  head: () => ({ meta: [{ title: "Vendedores — Admin NATV" }, { name: "description", content: "Vendedores no painel NATV." }, { property: "og:title", content: "Vendedores — Admin NATV" }, { property: "og:description", content: "Vendedores no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <><PageTitle title="Vendedores" /><Sellers /></>,
});
