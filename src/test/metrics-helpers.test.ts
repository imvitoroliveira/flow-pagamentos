import { describe, expect, it } from "vitest";
import { aggregateMetrics, getUfFromPhone, parseDeviceFromUA } from "@/lib/metrics-helpers";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0";
const CROS = "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/124.0";

describe("parseDeviceFromUA", () => {
  it("reconhece iOS, Android e desktop", () => {
    expect(parseDeviceFromUA(IPHONE)).toBe("iOS");
    expect(parseDeviceFromUA(IPAD)).toBe("iOS");
    expect(parseDeviceFromUA(ANDROID)).toBe("Android"); // tem "Linux", mas Android vence
    for (const ua of [WIN, MAC, LINUX, CROS]) expect(parseDeviceFromUA(ua)).toBe("Desktop");
  });
  it("nulo, vazio, desconhecido ou outro mobile → Outro", () => {
    expect(parseDeviceFromUA(null)).toBe("Outro");
    expect(parseDeviceFromUA(undefined)).toBe("Outro");
    expect(parseDeviceFromUA("")).toBe("Outro");
    expect(parseDeviceFromUA("curl/8.0")).toBe("Outro");
    expect(parseDeviceFromUA("Mozilla/5.0 (X11; Tizen) Mobile")).toBe("Outro");
  });
});

describe("getUfFromPhone", () => {
  it("DDDs de todas as regiões", () => {
    const cases: Record<string, string> = {
      "11": "SP", "19": "SP", "21": "RJ", "24": "RJ", "27": "ES", "31": "MG", "38": "MG", "41": "PR", "46": "PR", "47": "SC", "49": "SC",
      "51": "RS", "55": "RS", "61": "DF", "62": "GO", "63": "TO", "65": "MT", "67": "MS", "68": "AC", "69": "RO", "71": "BA", "77": "BA",
      "79": "SE", "81": "PE", "82": "AL", "83": "PB", "84": "RN", "85": "CE", "86": "PI", "91": "PA", "92": "AM", "95": "RR", "96": "AP", "98": "MA", "99": "MA",
    };
    for (const [ddd, uf] of Object.entries(cases)) expect(getUfFromPhone(`${ddd}987654321`)).toBe(uf);
  });
  it("com e sem DDI, com máscara e zeros", () => {
    expect(getUfFromPhone("+55 (11) 98765-4321")).toBe("SP");
    expect(getUfFromPhone("5511987654321")).toBe("SP");
    expect(getUfFromPhone("(21) 2345-6789")).toBe("RJ");
    expect(getUfFromPhone("0 11 98765-4321")).toBe("SP");
  });
  it("DDD 55 (RS) não é confundido com o DDI", () => {
    expect(getUfFromPhone("55987654321")).toBe("RS");
    expect(getUfFromPhone("555599998888")).toBe("RS"); // DDI 55 + DDD 55, 8 dígitos
    expect(getUfFromPhone("+55 55 99999-8888")).toBe("RS");
  });
  it("inválidos → null", () => {
    for (const v of [null, undefined, "", "abc", "12345", "10987654321", "52987654321", "72987654321", "119876543"]) expect(getUfFromPhone(v as string | null)).toBeNull();
  });
});

describe("aggregateMetrics", () => {
  const clicks = [
    { ref_code: "AAA111", user_agent: ANDROID }, { ref_code: "BBB222", user_agent: ANDROID }, { ref_code: "CCC333", user_agent: IPHONE },
    { ref_code: "DDD444", user_agent: WIN }, { ref_code: "EEE555", user_agent: null },
  ];
  const sales = [
    { ref_code: "AAA111", amount_cents: 3500, customer_phone: "11999990001" },
    { ref_code: "CCC333", amount_cents: 9000, customer_phone: "5521999990002" },
    { ref_code: "OLD999", amount_cents: 5000, customer_phone: "11999990003" }, // clique anterior ao período
    { ref_code: null, amount_cents: 3500, customer_phone: "" }, // renovação sem rastreio
  ];
  const r = aggregateMetrics(clicks, sales, new Map([["OLD999", ANDROID]]));
  it("conta acessos, vendas rastreadas e faturamento por aparelho", () => {
    expect(r.devices.find((d) => d.device === "Android")).toMatchObject({ accesses: 2, sales: 2, revenue_cents: 8500, conversion: 100 });
    expect(r.devices.find((d) => d.device === "iOS")).toMatchObject({ accesses: 1, sales: 1, revenue_cents: 9000, conversion: 100 });
    expect(r.devices.find((d) => d.device === "Desktop")).toMatchObject({ accesses: 1, sales: 0, conversion: 0 });
    expect(r.devices.find((d) => d.device === "Outro")).toMatchObject({ accesses: 1, sales: 0 });
    expect(r.topDevice?.device).toBe("Android");
  });
  it("totais: conversão global e faturamento rastreado em centavos", () => {
    expect(r.totals).toMatchObject({ accesses: 5, trackedSales: 3, trackedRevenue_cents: 17_500, allSales: 4, allRevenue_cents: 21_000 });
    expect(r.totals.conversion).toBe(60);
  });
  it("ranking por UF: ordenado por faturamento, participação soma 100, não identificado fora do campeão", () => {
    expect(r.states.map((s) => [s.uf, s.revenue_cents])).toEqual([["RJ", 9000], ["SP", 8500], [null, 3500]]);
    expect(r.topState?.uf).toBe("RJ");
    expect(r.states[1]).toMatchObject({ sales: 2, ticket_cents: 4250 });
    expect(Math.round(r.states.reduce((a, s) => a + (s.share ?? 0), 0))).toBe(100);
  });
  it("sem dados: nada quebra", () => {
    const e = aggregateMetrics([], []);
    expect(e.topDevice).toBeNull();
    expect(e.topState).toBeNull();
    expect(e.totals.conversion).toBeNull();
    expect(e.devices.every((d) => d.conversion === null)).toBe(true);
  });
});
