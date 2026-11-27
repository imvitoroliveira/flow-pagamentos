// Server-only: gera/estende contas de teste no painel da revenda e guarda o histórico em test_accounts.
import { findPanelUser, panelPost } from "./renewal.server";
import { PUBLIC_SITE_URL } from "./site-url";
import { formatTestMessage, isValidTestMinutes, parsePanelTestUser, type CreatedTest } from "./test-accounts";

// test_accounts é mais nova que os tipos gerados do Supabase
type Loose = { from: (t: string) => { insert: (r: unknown) => { select: (c: string) => { single: () => PromiseLike<{ data: unknown; error: Error | null }> } }; update: (r: unknown) => { eq: (c: string, v: string) => PromiseLike<{ error: Error | null }> } } };
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}


const detailOf = (r: { json: unknown; text: string }) => {
  const d = (r.json as { detail?: unknown } | null)?.detail;
  return typeof d === "string" ? d : r.text.slice(0, 200);
};

export async function createTestUser(input: {
  customerName?: string | undefined; customerPhone?: string | undefined; durationMinutes: number; customUsername?: string | undefined; notes?: string | undefined; createdBy?: string | undefined;
}): Promise<CreatedTest> {
  if (!isValidTestMinutes(input.durationMinutes)) throw new Error("Duração inválida para o painel.");
  let r: Awaited<ReturnType<typeof panelPost>>;
  try {
    r = await panelPost("/user", { username: input.customUsername || null, minutes: String(input.durationMinutes) });
  } catch (e) {
    if ((e as Error).message.includes("não configurada")) throw e;
    throw new Error(`O painel não respondeu (${(e as Error).message}). O teste pode ter sido criado: confira no painel antes de gerar outro.`);
  }
  if (r.status >= 500) throw new Error(`O painel falhou (${r.status}). O teste pode ter sido criado: confira no painel antes de gerar outro.`);
  if (!r.ok) throw new Error(`Painel ${r.status}: ${detailOf(r)}`);
  const u = parsePanelTestUser(r.json);
  if (!u) throw new Error("O painel respondeu em formato inesperado. O teste pode ter sido criado: confira no painel antes de gerar outro.");

  const domain = u.domain ?? "natv.pm";
  const row = {
    panel_id: u.id, username: u.username, password: u.password, domain,
    customer_name: input.customerName?.trim() || null, customer_phone: input.customerPhone?.replace(/\D/g, "") || null,
    duration_minutes: input.durationMinutes, expires_at: u.expiresAt.toISOString(), notes: input.notes?.trim() || u.notes, created_by: input.createdBy ?? null,
  };
  let id: string | null = null, saved = false;
  try {
    const { data, error } = await (await db()).from("test_accounts").insert(row).select("id").single();
    if (!error) { id = (data as { id: string }).id; saved = true; }
  } catch { /* o teste já existe no painel; segue com os dados */ }
  const message = formatTestMessage({ username: u.username, password: u.password, domain, minutes: input.durationMinutes, customerName: row.customer_name }, PUBLIC_SITE_URL);
  return { id, username: u.username, password: u.password, domain, minutes: input.durationMinutes, expires_at: row.expires_at, customer_name: row.customer_name, customer_phone: row.customer_phone, message, saved };
}

/** Estende o teste no painel (só trials) e atualiza o vencimento local com o valor real do painel. */
export async function extendTestUser(username: string): Promise<{ expires_at: string | null }> {
  let r: Awaited<ReturnType<typeof panelPost>>;
  try { r = await panelPost("/user/extend_test", { username }); }
  catch (e) { throw new Error(`O painel não respondeu (${(e as Error).message}).`); }
  if (!r.ok) throw new Error(`Painel ${r.status}: ${detailOf(r)}`);
  let expires: string | null = null;
  try {
    const p = await findPanelUser(username);
    if (p?.exp_date) expires = new Date(p.exp_date * 1000).toISOString();
  } catch { /* vencimento será atualizado na próxima consulta */ }
  if (expires) await (await db()).from("test_accounts").update({ expires_at: expires }).eq("username", username);
  return { expires_at: expires };
}
