import { createFileRoute } from "@tanstack/react-router";

// Called by the scheduler only while retries are pending. Takes no input and only
// processes retries that are already due, each claimed once, so repeated calls are harmless.
export const Route = createFileRoute("/api/public/renewal-retries")({
  server: {
    handlers: {
      POST: async () => {
        const { processDueRetries } = await import("@/lib/renewal.server");
        return Response.json(await processDueRetries());
      },
    },
  },
});
