// Geolocalização do visitante (puro). A Cloudflare não manda "cf-region-code" como cabeçalho comum:
// os dados vêm em request.cf (regionCode/country), então lemos os dois lugares.

export type CfGeo = { regionCode?: string; country?: string; region?: string };

export const requestCf = (request: Request): CfGeo | undefined => (request as unknown as { cf?: CfGeo }).cf;

/** UF brasileira (2 letras) ou null. Sem país conhecido assume Brasil; país conhecido diferente de BR → null. */
export function resolveUf(headerRegion: string | null | undefined, cf: CfGeo | undefined, country: string | null | undefined): string | null {
  const raw = (headerRegion ?? cf?.regionCode ?? "").trim().toUpperCase();
  const c = (country ?? cf?.country ?? "").trim().toUpperCase();
  const isBrazil = !c || c === "BR";
  return isBrazil && /^[A-Z]{2}$/.test(raw) ? raw : null;
}

export const readUf = (request: Request, country?: string | null) =>
  resolveUf(request.headers.get("cf-region-code"), requestCf(request), country ?? request.headers.get("cf-ipcountry"));
