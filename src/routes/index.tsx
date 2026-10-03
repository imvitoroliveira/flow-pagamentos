import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/pagar", search: search as Record<string, string> });
  },
  head: () => ({
    meta: [
      { title: "NATV — Assine ou renove" },
      { name: "description", content: "Assine ou renove seu NATV com PIX em segundos." },
      { property: "og:title", content: "NATV — Assine ou renove" },
      { property: "og:description", content: "Assine ou renove seu NATV com PIX em segundos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
