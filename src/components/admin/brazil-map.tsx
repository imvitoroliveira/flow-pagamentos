import { useMemo, useRef, useState } from "react";
import { BRAZIL_PATHS, BRAZIL_VIEWBOX } from "@/lib/brazil-paths";
import { mapOpacity, UF_NAME } from "@/lib/metrics-helpers";

export type MapState = { uf: string; sales: number; revenue_cents: number; share: number | null };

const money = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (n: number | null) => (n == null || !isFinite(n) ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const UFS = Object.keys(BRAZIL_PATHS);

/** Inline-SVG map of Brazil: states with sales get a teal fill proportional to revenue; hover/tap/focus opens a tooltip. */
export function BrazilMap({ states }: { states: MapState[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ uf: string; x: number; y: number } | null>(null);
  const byUf = useMemo(() => new Map(states.map((s) => [s.uf, s])), [states]);
  const max = useMemo(() => Math.max(0, ...states.map((s) => s.revenue_cents)), [states]);
  // the focused state is drawn last so its stroke isn't hidden by neighbours
  const order = useMemo(() => (active ? [...UFS.filter((u) => u !== active.uf), active.uf] : UFS), [active]);

  const place = (uf: string, clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setActive({ uf, x: clientX - r.left, y: clientY - r.top });
  };
  const placeAtElement = (uf: string, el: Element) => {
    const r = el.getBoundingClientRect();
    place(uf, r.left + r.width / 2, r.top + r.height / 2);
  };

  const s = active ? byUf.get(active.uf) : undefined;
  const width = box.current?.clientWidth ?? 0;
  const flip = active ? active.x > width * 0.55 : false;

  return (
    <div ref={box} className="relative mx-auto aspect-square w-full max-w-lg" onPointerLeave={() => setActive(null)}>
      <svg viewBox={BRAZIL_VIEWBOX} className="h-full w-full" role="group" aria-label="Mapa do Brasil com faturamento por estado">
        {order.map((uf) => {
          const row = byUf.get(uf);
          const o = row ? mapOpacity(row.revenue_cents, max) : 0;
          const label = `${uf} · ${UF_NAME[uf] ?? uf}${row ? `: ${row.sales} vendas, ${money(row.revenue_cents)}` : ": sem vendas"}`;
          return (
            <path
              key={uf} d={BRAZIL_PATHS[uf]} aria-label={label} role="img" tabIndex={row ? 0 : -1}
              strokeWidth={active?.uf === uf ? 1.4 : 0.6} strokeLinejoin="round"
              style={row ? ({ "--o": o } as React.CSSProperties) : undefined}
              className={`cursor-pointer outline-none transition-colors duration-200 focus-visible:stroke-primary ${
                row ? "fill-primary [fill-opacity:var(--o)] hover:[fill-opacity:1] focus-visible:[fill-opacity:1]" : "fill-muted/20"
              } ${active?.uf === uf ? "stroke-primary" : "stroke-border/40 hover:stroke-primary"}`}
              onPointerEnter={(e) => place(uf, e.clientX, e.clientY)}
              onPointerMove={(e) => place(uf, e.clientX, e.clientY)}
              onPointerDown={(e) => place(uf, e.clientX, e.clientY)}
              onFocus={(e) => placeAtElement(uf, e.currentTarget)}
              onBlur={() => setActive(null)}
            />
          );
        })}
      </svg>

      {active && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-max max-w-[14rem] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: active.x, top: active.y, transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, -110%)` }}
        >
          <p className="font-semibold">{active.uf} · {UF_NAME[active.uf] ?? active.uf}</p>
          {s ? (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              <li>{s.sales.toLocaleString("pt-BR")} {s.sales === 1 ? "venda" : "vendas"}</li>
              <li>{money(s.revenue_cents)}</li>
              <li>{percent(s.share)} do total</li>
            </ul>
          ) : <p className="mt-1 text-muted-foreground">Sem vendas no período</p>}
        </div>
      )}
    </div>
  );
}
