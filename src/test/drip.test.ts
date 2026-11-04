import { describe, expect, it } from "vitest";
import { nextRunFor } from "@/lib/renewal.server";

describe("renovação fracionada", () => {
  it("agenda a próxima renovação 2 dias antes do vencimento", () => {
    const exp = new Date(Date.now() + 30 * 86_400_000);
    expect(new Date(nextRunFor(exp)).getTime()).toBe(exp.getTime() - 2 * 86_400_000);
  });
  it("renova imediatamente se já está a menos de 2 dias do vencimento", () => {
    const exp = new Date(Date.now() + 86_400_000);
    expect(Math.abs(new Date(nextRunFor(exp)).getTime() - Date.now())).toBeLessThan(1000);
  });
});
