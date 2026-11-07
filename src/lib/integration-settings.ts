// Shared (client + server): which integration settings can be edited in the admin and how they are validated.
import { extractMetaPixel } from "./admin-schemas";

export const SETTING_KEYS = ["META_CAPI_TOKEN", "META_PIXEL_ID", "META_TEST_EVENT_CODE"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Secrets are write-only: after saving, the value is never sent back to the browser. */
export const SECRET_KEYS: readonly SettingKey[] = ["META_CAPI_TOKEN"];
export const isSecretKey = (k: SettingKey) => SECRET_KEYS.includes(k);

export type Validated = { ok: true; value: string } | { ok: false; error: string };

export function validateSetting(key: SettingKey, raw: string): Validated {
  const v = raw.trim();
  if (!v) return { ok: false, error: "Informe um valor." };
  switch (key) {
    case "META_PIXEL_ID": {
      const id = extractMetaPixel(v); // accepts the raw ID or the whole pixel snippet
      return /^\d{10,20}$/.test(id) ? { ok: true, value: id } : { ok: false, error: "Pixel ID deve ter de 10 a 20 dígitos." };
    }
    case "META_CAPI_TOKEN":
      if (/\s/.test(v)) return { ok: false, error: "O token não pode ter espaços ou quebras de linha." };
      if (v.length < 20 || v.length > 1000) return { ok: false, error: "Token inválido: confira se copiou inteiro." };
      return { ok: true, value: v };
    case "META_TEST_EVENT_CODE":
      return /^[A-Za-z0-9_-]{3,40}$/.test(v) ? { ok: true, value: v } : { ok: false, error: "Código de teste inválido (use só letras e números, ex.: TEST12345)." };
  }
}
