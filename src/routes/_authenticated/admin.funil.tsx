import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/coming-soon";

export const Route = createFileRoute("/_authenticated/admin/funil")({
  head: () => ({ meta: [{ title: "Funil e sessões — Admin NATV" }, { name: "description", content: "Funil e sessões no painel NATV." }, { property: "og:title", content: "Funil e sessões — Admin NATV" }, { property: "og:description", content: "Funil e sessões no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <ComingSoon title="Funil e sessões" />,
});
