import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/pagar", search: search as never });
  },
  head: () => ({
    meta: [
      { title: "Flow Pagamentos — Assine ou renove" },
      { name: "description", content: "Assine ou renove com PIX em segundos." },
      { property: "og:title", content: "Flow Pagamentos — Assine ou renove" },
      { property: "og:description", content: "Assine ou renove com PIX em segundos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
