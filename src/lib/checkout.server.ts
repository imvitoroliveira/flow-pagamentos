// Server-only helpers: AbacatePay, Telegram, panel renewal.
import { createHash } from "crypto";

export function hashIp(ip: string) {
  return createHash("sha256").update(ip + (process.env["IP_SALT"] ?? "natv")).digest("hex").slice(0, 32);
}

export function makeRefCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function createAbacatePix(input: {
  amountCents: number;
  description: string;
  name: string;
  phone: string;
  email?: string | null;
  orderId: string;
}) {
  const key = process.env["ABACATEPAY_API_KEY"];
  if (!key) throw new Error("Pagamento PIX ainda não configurado.");
  const res = await fetch("https://api.abacatepay.com/v1/pixQrCode/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountCents,
      expiresIn: 3600,
      description: input.description.slice(0, 37),
      metadata: { externalId: input.orderId },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { id: string; brCode: string; brCodeBase64: string };
    error?: unknown;
  };
  if (!res.ok || !json.data) {
    console.error("AbacatePay error", res.status, json);
    throw new Error("Não foi possível gerar o PIX. Tente novamente.");
  }
  return json.data;
}

export async function sendTelegram(chatId: string, text: string) {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  return res.ok;
}

/** Calls the external panel to renew a user. Configure PANEL_RENEW_URL + PANEL_API_KEY. */
export async function renewOnPanel(username: string, months: number) {
  const url = process.env["PANEL_RENEW_URL"];
  if (!url) throw new Error("Renovação automática não configurada (PANEL_RENEW_URL).");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env["PANEL_API_KEY"] ?? ""}`,
    },
    body: JSON.stringify({ username, months }),
  });
  if (!res.ok) throw new Error(`Painel respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
