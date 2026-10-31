import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/coming-soon";
import { AuditLog } from "@/components/admin/logs-audit";
import { NotificationLogs } from "@/components/admin/logs-notifications";
import { WebhookLogs } from "@/components/admin/logs-webhooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  head: () => ({ meta: [{ title: "Logs — Admin NATV" }, { name: "description", content: "Logs no painel NATV." }, { property: "og:title", content: "Logs — Admin NATV" }, { property: "og:description", content: "Logs no painel NATV." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: LogsPage,
});

function LogsPage() {
  return (
    <div className="space-y-4">
      <PageTitle title="Logs" subtitle="Webhooks recebidos, notificações enviadas e ações da equipe" />
      <Tabs defaultValue="webhooks">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="webhooks" className="min-h-11 px-4">Webhooks</TabsTrigger>
          <TabsTrigger value="notifications" className="min-h-11 px-4">Notificações</TabsTrigger>
          <TabsTrigger value="audit" className="min-h-11 px-4">Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="webhooks"><WebhookLogs /></TabsContent>
        <TabsContent value="notifications"><NotificationLogs /></TabsContent>
        <TabsContent value="audit"><AuditLog /></TabsContent>
      </Tabs>
    </div>
  );
}
