import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public: the landing page already resolved (campaign/global fallbacks). Null when missing or inactive. */
export const getLandingPage = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().max(60) }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicLanding } = await import("./landing.server");
    return getPublicLanding(data.slug);
  });
