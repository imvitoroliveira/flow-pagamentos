// Régua de cobrança (pura, sem rede): quem avisar hoje, com qual modelo e para qual número.

export type Regua = "d3" | "d1" | "d0" | "vencido";
export const REGUA_LABEL: Record<Regua, string> = { d3: "Vence em 3 dias", d1: "Vence amanhã", d0: "Vence hoje", vencido: "Vencido" };

export type Templates = Record<Regua, string>;
export const DEFAULT_TEMPLATES: Templates = {
  d3: "Olá {nome}! Seu acesso NATV vence em {vencimento} (em 3 dias). Renove com antecedência pelo link: {link}",
  d1: "Olá {nome}, lembrete: seu plano vence amanhã ({vencimento}). Garanta sua renovação sem corte: {link}",
  d0: "Atenção {nome}! Sua assinatura vence hoje ({vencimento}). Acesse o link para renovar via PIX imediato: {link}",
  vencido: "Olá {nome}, notamos que seu acesso venceu em {vencimento}. Deseja reativar agora? Link de ativação: {link}",
};

/** "11999998888" / "+55 (11) 99999-8888" → "5511999998888". Nulo/inválido → null. */
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return null;
}

const SP = "America/Sao_Paulo";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: SP, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayNumber = (d: Date) => { const [y, m, dd] = ymd(d).split("-").map(Number) as [number, number, number]; return Date.UTC(y, m - 1, dd) / 86_400_000; };

/** Dias de calendário (fuso de São Paulo) entre hoje e o vencimento: +3 = vence em 3 dias, -2 = venceu há 2 dias. */
export function daysUntil(expiresAt: string | Date, now: Date = new Date()): number {
  return dayNumber(new Date(expiresAt)) - dayNumber(now);
}

/** D-3, D-1, D-0 e vencidos de 1 a 7 dias. Qualquer outro dia não entra na fila. */
export function classifyRegua(days: number): Regua | null {
  if (days === 3) return "d3";
  if (days === 1) return "d1";
  if (days === 0) return "d0";
  if (days <= -1 && days >= -7) return "vencido";
  return null;
}

export const fmtVencimento = (iso: string | Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: SP, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

/** Troca {nome}, {usuario}, {vencimento}, {dias}, {link}. Variável desconhecida fica como está. */
export function interpolate(tpl: string, v: Partial<Record<"nome" | "usuario" | "vencimento" | "dias" | "link", string | number>>): string {
  return tpl.replace(/\{(nome|usuario|vencimento|dias|link)\}/g, (m, k: keyof typeof v) => (v[k] === undefined ? m : String(v[k])));
}

export type CobrancaClient = { username: string; phone: string | null; expires_at: string | null; blocked: boolean };
export type QueueItem = {
  username: string; name: string; phone: string | null; expires_at: string; days: number; regua: Regua; text: string;
};

/**
 * Fila de hoje. Fora dela: bloqueados, sem vencimento, fora da régua e quem tem Futuros ativo/pausado
 * (já pagou meses adiantados; o robô renova). Sem número válido o cliente entra com phone = null ("Sem número").
 */
export function buildQueue(opts: {
  clients: CobrancaClient[];
  scheduledUsernames: Iterable<string>;
  names?: Map<string, string>;
  templates?: Templates;
  link: string;
  now?: Date;
}): QueueItem[] {
  const now = opts.now ?? new Date();
  const tpls = opts.templates ?? DEFAULT_TEMPLATES;
  const skip = new Set([...opts.scheduledUsernames].map((u) => u.toLowerCase()));
  const out: QueueItem[] = [];
  for (const c of opts.clients) {
    if (c.blocked || !c.expires_at || skip.has(c.username.toLowerCase())) continue;
    const days = daysUntil(c.expires_at, now);
    const regua = classifyRegua(days);
    if (!regua) continue;
    const name = opts.names?.get(c.username.toLowerCase())?.trim() || c.username;
    const text = interpolate(tpls[regua], { nome: name.split(/\s+/)[0] ?? name, usuario: c.username, vencimento: fmtVencimento(c.expires_at), dias: days, link: opts.link });
    out.push({ username: c.username, name, phone: normalizePhoneBR(c.phone), expires_at: c.expires_at, days, regua, text });
  }
  return out.sort((a, b) => b.days - a.days || a.username.localeCompare(b.username));
}

export const waLink = (phone: string, text?: string) => `https://web.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;

/** Lista completa em texto para backup / colar em outra ferramenta. */
export function formatBatch(items: QueueItem[]): string {
  return items.map((i) => `${i.name} (${i.username}) — ${i.phone ?? "SEM NÚMERO"}\n${i.text}`).join("\n\n");
}
