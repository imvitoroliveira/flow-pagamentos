import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "NATV — Acesso ao sistema" },
      { name: "description", content: "Acesso de administradores e vendedores NATV." },
      { property: "og:title", content: "NATV — Acesso ao sistema" },
      { property: "og:description", content: "Acesso de administradores e vendedores NATV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
