// Public address of the published site. Campaign / payment links given to customers must always use it,
// never window.location.origin (which is the preview or editor address when the admin is opened there).
// Override with VITE_PUBLIC_SITE_URL (e.g. when a custom domain is connected).
const DEFAULT_SITE_URL = "https://administrativotop.lovable.app";

export function normalizeSiteUrl(raw: string | undefined | null): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/i.test(v) ? v : DEFAULT_SITE_URL;
}

export const PUBLIC_SITE_URL = normalizeSiteUrl((import.meta.env as Record<string, string | undefined>)["VITE_PUBLIC_SITE_URL"]);

/** Absolute public URL for a path such as "/r/facebook-ads?l=abc&pagar=1". */
export const publicUrl = (path: string) => `${PUBLIC_SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
