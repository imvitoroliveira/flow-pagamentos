import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CUSTOM_USERNAME_RE, isValidTestMinutes } from "./test-accounts";

type Ctx = Parameters<typeof import("./admin.server").assertAdmin>[0];
async function guard(context: unknown) {
  const m = await import("./admin.server");
  await m.assertAdmin(context as Ctx);
  return { ...m, ctx: context as Ctx };
}
const fail = (error: string) => ({ ok: false as const, error });

const createSchema = z.object({
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  durationMinutes: z.number().int().refine(isValidTestMinutes, "Duração inválida"),
  customUsername: z.string().trim().regex(CUSTOM_USERNAME_RE, "Usuário: 3 a 32 caracteres (letras, números, . _ -)").optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(300).optional(),
});

export const createTestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const { createTestUser } = await import("./tests.server");
    try {
      const t = await createTestUser({ ...data, createdBy: ctx.userId });
      await logAdminAction(ctx, { action: "test_created", entity: "test_account", ...(t.id ? { entity_id: t.id } : {}), details: { username: t.username, minutes: t.minutes, customer_name: t.customer_name } });
      return { ok: true as const, test: t };
    } catch (e) { return fail((e as Error).message); }
  });

export type TestRow = {
  id: string; username: string; password: string; domain: string | null; customer_name: string | null; customer_phone: string | null;
  duration_minutes: number; expires_at: string; created_at: string;
};

export const listTestsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ctx } = await guard(context);
    // test_accounts é mais nova que os tipos gerados do Supabase
    const sb = ctx.supabase as unknown as { from: (t: string) => { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: TestRow[] | null; error: Error | null }> } } } };
    const { data, error } = await sb.from("test_accounts")
      .select("id, username, password, domain, customer_name, customer_phone, duration_minutes, expires_at, created_at")
      .order("created_at", { ascending: false }).limit(50);
    if (error) return fail("Não foi possível carregar os testes. A migração 0018 (test_accounts) está aplicada?");
    return { ok: true as const, tests: data ?? [] };
  });

export const extendTestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ username: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { ctx, logAdminAction } = await guard(context);
    const { extendTestUser } = await import("./tests.server");
    try {
      const r = await extendTestUser(data.username);
      await logAdminAction(ctx, { action: "test_extended", entity: "test_account", details: { username: data.username } });
      return { ok: true as const, expires_at: r.expires_at };
    } catch (e) { return fail((e as Error).message); }
  });
