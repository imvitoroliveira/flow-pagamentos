import { describe, expect, it } from "vitest";
import { readUf, requestCf, resolveUf } from "@/lib/geo";
import { getUfFromPhone } from "@/lib/metrics-helpers";

const req = (headers: Record<string, string> = {}, cf?: Record<string, string>) => {
  const r = new Request("https://x.test/r/a", { headers });
  if (cf) Object.defineProperty(r, "cf", { value: cf });
  return r;
};

describe("UF do visitante", () => {
  it("lê o cabeçalho cf-region-code", () => {
    expect(readUf(req({ "cf-region-code": "sp" }))).toBe("SP");
  });
  it("lê request.cf.regionCode quando não há cabeçalho", () => {
    const r = req({}, { regionCode: "rj", country: "BR" });
    expect(requestCf(r)?.regionCode).toBe("rj");
    expect(readUf(r)).toBe("RJ");
  });
  it("o cabeçalho tem prioridade sobre request.cf", () => {
    expect(readUf(req({ "cf-region-code": "MG" }, { regionCode: "RJ" }))).toBe("MG");
  });
  it("sem dados ou formato inválido → null", () => {
    expect(readUf(req())).toBeNull();
    expect(resolveUf("Sao Paulo", undefined, "BR")).toBeNull();
    expect(resolveUf("", { regionCode: "1" }, null)).toBeNull();
  });
  it("país conhecido diferente de BR não vira UF (CA = Califórnia, não Ceará)", () => {
    expect(resolveUf("CA", undefined, "US")).toBeNull();
    expect(readUf(req({ "cf-region-code": "CA", "cf-ipcountry": "US" }))).toBeNull();
    expect(readUf(req({}, { regionCode: "CA", country: "US" }))).toBeNull();
  });
  it("país desconhecido é tratado como Brasil", () => {
    expect(resolveUf("BA", undefined, null)).toBe("BA");
    expect(resolveUf(null, { regionCode: "BA", country: "BR" }, null)).toBe("BA");
  });
});

describe("UF pelo DDD do checkout", () => {
  it("getUfFromPhone preenche quando o clique ficou sem UF", () => {
    expect(getUfFromPhone("(11) 99999-8888")).toBe("SP");
    expect(getUfFromPhone("5521988887777")).toBe("RJ");
    expect(getUfFromPhone("123")).toBeNull();
  });
});
