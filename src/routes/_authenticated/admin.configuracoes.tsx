import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/coming-soon";
import { PlansSettings } from "@/components/admin/settings-plans";
import { IntegrationsSettings } from "@/components/admin/settings-integrations";
import { ReadinessChecklist } from "@/components/admin/settings-readiness";
import { TeamSettings } from "@/components/admin/settings-team";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Admin NATV" }, { name: "description", content: "Configurações no painel NATV." }, { property: "og:title", content: "Configurações — Admin NATV" }, { property: "og:description", content: "Configurações no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageTitle title="Configurações" subtitle="Planos, integrações, equipe e prontidão para produção" />
      <Tabs defaultValue="plans">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="plans" className="min-h-11 px-4">Planos</TabsTrigger>
          <TabsTrigger value="integrations" className="min-h-11 px-4">Integrações</TabsTrigger>
          <TabsTrigger value="team" className="min-h-11 px-4">Equipe</TabsTrigger>
          <TabsTrigger value="production" className="min-h-11 px-4">Pronto para produção</TabsTrigger>
        </TabsList>
        <TabsContent value="plans"><PlansSettings /></TabsContent>
        <TabsContent value="integrations"><IntegrationsSettings /></TabsContent>
        <TabsContent value="team"><TeamSettings /></TabsContent>
        <TabsContent value="production"><ReadinessChecklist /></TabsContent>
      </Tabs>
    </div>
  );
}
