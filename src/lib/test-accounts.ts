// Contas de teste (puro, sem rede): minutos aceitos pela API do painel, mensagem de fechamento e link de pagamento.
import { normalizePhoneBR } from "./cobranca";

/** Valores aceitos pelo campo `minutes` de POST /user (string enum no painel). */
export const PANEL_TEST_MINUTES = ["15", "30", "60", "120", "180", "240", "300", "360"] as const;
export type PanelTestMinutes = (typeof PANEL_TEST_MINUTES)[number];
/** Durações oferecidas na tela. */
export const UI_DURATIONS = [60, 120, 240, 360] as const;
export const DEFAULT_TEST_MINUTES = 120;

export const isPanelMinutes = (v: unknown): v is PanelTestMinutes => typeof v === "string" && (PANEL_TEST_MINUTES as readonly string[]).includes(v);
export const isValidTestMinutes = (n: number) => Number.isInteger(n) && isPanelMinutes(String(n));

/** "1 hora", "2 horas", "30 minutos", "1h30". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (m) return `${h}h${String(m).padStart(2, "0")}`;
  return h === 1 ? "1 hora" : `${h} horas`;
}

/** Usuário personalizado: letras, números, ponto, traço e underline (3 a 32). */
export const CUSTOM_USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Usuário sugerido a partir do nome: "Vitor Hugo Oliveira" → "vitor.oliveira" (primeiro + último sobrenome). */
export function suggestUsername(fullName: string): string {
  const words = fullName
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter((w) => w && !NAME_PARTICLES.has(w));
  if (!words.length) return "";
  const parts = words.length > 1 ? [words[0]!, words[words.length - 1]!] : [words[0]!];
  return parts.join(".").slice(0, 32);
}

export type TestData = { username: string; password: string; domain: string; minutes: number; customerName?: string | null };

/** Link de renovação com o usuário do teste já preenchido. */
export const testPayLink = (origin: string, username: string) => `${origin.replace(/\/+$/, "")}/pagar?u=${encodeURIComponent(username)}`;

export const TEST_MESSAGE_TEMPLATE = `Prontinho, {nome}! Seu teste de {duracao} está ativo:

🔑 Usuário: {usuario}
🔒 Senha: {senha}
🔗 Servidor: {dns}

Dica: Aproveite para testar no horário de pico e conferir a estabilidade! ⚡

💡 Se quiser garantir seu plano sem interrupções e com ativação automática via PIX:
👉 {link_pagamento}
(Seu usuário já vai preenchido para renovar direto na sua conta de teste!)`;

export function formatTestMessage(t: TestData, origin: string): string {
  const nome = t.customerName?.trim().split(/\s+/)[0] || "amigo(a)";
  const vars: Record<string, string> = {
    nome, duracao: durationLabel(t.minutes), usuario: t.username, senha: t.password, dns: t.domain, link_pagamento: testPayLink(origin, t.username),
  };
  return TEST_MESSAGE_TEMPLATE.replace(/\{(nome|duracao|usuario|senha|dns|link_pagamento)\}/g, (_m, k: string) => vars[k] ?? "");
}

/** Máscara (99) 99999-9999 enquanto digita. */
export function maskPhoneBR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** wa.me só com telefone válido; sem telefone → null. */
export function testWhatsappUrl(phone: string | null | undefined, text: string): string | null {
  const p = normalizePhoneBR(phone);
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null;
}

export const isTestActive = (expiresAt: string | Date, now: Date = new Date()) => new Date(expiresAt).getTime() > now.getTime();

/** Resposta de POST /user validada: nunca confia no formato. */
export function parsePanelTestUser(json: unknown): { id: string | null; username: string; password: string; domain: string | null; expiresAt: Date; notes: string | null } | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const username = typeof j["username"] === "string" ? j["username"] : null;
  const password = typeof j["password"] === "string" ? j["password"] : j["password"] != null ? String(j["password"]) : null;
  const exp = Number(j["exp_date"]);
  if (!username || !password || !Number.isFinite(exp) || exp <= 0) return null;
  return {
    id: j["id"] != null ? String(j["id"]) : null, username, password,
    domain: typeof j["domain"] === "string" && j["domain"] ? j["domain"] : null,
    expiresAt: new Date(exp * 1000), notes: typeof j["notes"] === "string" ? j["notes"] : null,
  };
}

/** Teste recém-criado devolvido pelo servidor para a tela. */
export type CreatedTest = {
  id: string | null; username: string; password: string; domain: string; minutes: number; expires_at: string;
  customer_name: string | null; customer_phone: string | null; message: string; saved: boolean;
};
