// Server-only: integration settings saved from the admin (table integration_settings, service role only),
// falling back to server environment variables when nothing was saved in the admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSecretKey, SETTING_KEYS, type SettingKey } from "./integration-settings";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient; // table is newer than the generated types
}

export type SettingInfo = { value: string | null; source: "painel" | "servidor" | null; updatedAt: string | null };

const tableMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

/** Value saved in the admin wins; otherwise the environment variable of the same name. Never throws. */
export async function getSetting(key: SettingKey): Promise<SettingInfo> {
  try {
    const sb = await db();
    const { data, error } = await sb.from("integration_settings").select("value, updated_at").eq("key", key).maybeSingle();
    if (!error && data?.value?.trim()) return { value: data.value.trim(), source: "painel", updatedAt: data.updated_at ?? null };
  } catch (e) {
    console.error("[integration-settings] read failed", key, (e as Error).message);
  }
  const env = process.env[key]?.trim();
  return env ? { value: env, source: "servidor", updatedAt: null } : { value: null, source: null, updatedAt: null };
}

/** What the admin screen shows. Secret values are NEVER included, only "configured" + where from. */
export async function describeSettings() {
  const sb = await db();
  const { data, error } = await sb.from("integration_settings").select("key, updated_at").in("key", [...SETTING_KEYS]);
  const tableReady = !tableMissing(error);
  const items = await Promise.all(SETTING_KEYS.map(async (key) => {
    const s = await getSetting(key);
    return { key, secret: isSecretKey(key), configured: s.value !== null, source: s.source, updatedAt: s.updatedAt ?? (data?.find((r: { key: string }) => r.key === key)?.updated_at ?? null), value: isSecretKey(key) ? null : s.value };
  }));
  const code = items.find((i) => i.key === "META_TEST_EVENT_CODE");
  return { tableReady, testMode: !!code?.configured, items };
}

export async function saveSetting(key: SettingKey, value: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await db();
  const { error } = await sb.from("integration_settings").upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "key" });
  if (!error) return { ok: true };
  console.error("[integration-settings] save failed", key, error.message);
  return { ok: false, error: tableMissing(error) ? "A tabela de configurações ainda não existe no banco. Aplique a migração 0008 (veja o aviso na tela)." : "Não foi possível salvar." };
}

export async function clearSetting(key: SettingKey): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await db();
  const { error } = await sb.from("integration_settings").delete().eq("key", key);
  if (error && !tableMissing(error)) { console.error("[integration-settings] clear failed", key, error.message); return { ok: false, error: "Não foi possível remover." }; }
  return { ok: true };
}
