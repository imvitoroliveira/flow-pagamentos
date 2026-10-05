import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/coming-soon";
import { Webhooks } from "@/components/admin/legacy";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  head: () => ({ meta: [{ title: "Logs — Admin NATV" }, { name: "description", content: "Logs no painel NATV." }, { property: "og:title", content: "Logs — Admin NATV" }, { property: "og:description", content: "Logs no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <><PageTitle title="Logs" subtitle="Webhooks recebidos" /><Webhooks /></>,
});
