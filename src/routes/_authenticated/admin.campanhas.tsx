import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/coming-soon";
import { Campaigns } from "@/components/admin/legacy";

export const Route = createFileRoute("/_authenticated/admin/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — Admin NATV" }, { name: "description", content: "Campanhas no painel NATV." }, { property: "og:title", content: "Campanhas — Admin NATV" }, { property: "og:description", content: "Campanhas no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <><PageTitle title="Campanhas" /><Campaigns /></>,
});
