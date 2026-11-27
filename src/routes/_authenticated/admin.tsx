import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  BarChart3, CalendarDays, ChevronRight, Filter, FlaskConical, CalendarClock, Funnel, LayoutDashboard, LogOut, Megaphone, MessageSquareShare, PanelTop, Receipt, ScrollText, Settings, ShoppingBag, TrendingUp, UserRound, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkAdmin } from "@/lib/admin.functions";
import { adminSearchSchema, PERIOD_LABEL, PERIODS, resolveRange, type AdminSearch, type Period } from "@/lib/admin-filters";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: adminSearchSchema,
  beforeLoad: async () => {
    try {
      await checkAdmin();
    } catch {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Painel administrativo — NATV" },
      { name: "description", content: "Vendas, renovações, campanhas e vendedores NATV." },
      { property: "og:title", content: "Painel administrativo — NATV" },
      { property: "og:description", content: "Vendas, renovações, campanhas e vendedores NATV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

/** Global admin filters from the URL, resolved to São Paulo day bounds (ISO) + previous period. */
export function useAdminFilters() {
  const search = Route.useSearch();
  return { ...resolveRange(search), search };
}

const NAV_TOP = { to: "/admin", label: "Visão geral", icon: LayoutDashboard } as const;

const NAV_GROUPS = [
  {
    label: "Vendas & Tráfego", icon: ShoppingBag,
    items: [
      { to: "/admin/pedidos", label: "Pedidos", icon: Receipt },
      { to: "/admin/lps", label: "Landing Pages", icon: PanelTop },
      { to: "/admin/campanhas", label: "Campanhas", icon: Megaphone },
      { to: "/admin/vendedores", label: "Vendedores", icon: Users },
    ],
  },
  {
    label: "Clientes & Cobrança", icon: UserRound,
    items: [
      { to: "/admin/clientes", label: "Clientes", icon: UserRound },
      { to: "/admin/cobranca", label: "Cobrança WhatsApp", icon: MessageSquareShare },
      { to: "/admin/futuros", label: "Vencimentos Futuros", icon: CalendarClock },
      { to: "/admin/testes", label: "Testes Rápidos", icon: FlaskConical },
    ],
  },
  {
    label: "Inteligência", icon: TrendingUp,
    items: [
      { to: "/admin/metricas", label: "Métricas & Aparelhos", icon: TrendingUp },
      { to: "/admin/funil", label: "Funil e Sessões", icon: Funnel },
    ],
  },
  {
    label: "Sistema & Configurações", icon: Settings,
    items: [
      { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
      { to: "/admin/logs", label: "Logs de Auditoria", icon: ScrollText },
    ],
  },
] as const;

function AdminLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <BarChart3 className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="font-display font-bold group-data-[collapsible=icon]:hidden">NATV <span className="text-primary">Admin</span></span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={NAV_TOP.label} className="h-11">
                    <Link to={NAV_TOP.to} search={(s: Partial<AdminSearch>) => s as never} activeOptions={{ exact: true, includeSearch: false }}
                      activeProps={{ "data-active": true } as never}>
                      <NAV_TOP.icon aria-hidden /> <span>{NAV_TOP.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {NAV_GROUPS.map((g) => (
                  <Collapsible
                    key={g.label}
                    asChild
                    defaultOpen={g.items.some((i) => currentPath.startsWith(i.to))}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={g.label} className="h-11">
                          <g.icon aria-hidden />
                          <span>{g.label}</span>
                          <ChevronRight aria-hidden className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {g.items.map((n) => (
                            <SidebarMenuSubItem key={n.to}>
                              <SidebarMenuSubButton asChild className="h-9 py-1.5 text-xs" isActive={currentPath.startsWith(n.to)}>
                                <Link to={n.to} search={(s: Partial<AdminSearch>) => s as never} activeOptions={{ includeSearch: false }}>
                                  <n.icon aria-hidden /> <span>{n.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{user.email}</p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} tooltip="Sair" className="h-11"><LogOut aria-hidden /> <span>Sair</span></SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur-md">
          <SidebarTrigger className="size-11" aria-label="Abrir menu" />
          <div className="ml-auto hidden items-end gap-2 md:flex"><Filters /></div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="ml-auto h-11 md:hidden"><Filter aria-hidden /> Filtros</Button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
              <div className="grid gap-3 p-4"><Filters /></div>
            </SheetContent>
          </Sheet>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 md:p-6"><Outlet /></main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Filters() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const range = resolveRange(search);
  const set = (patch: Partial<AdminSearch>) => navigate({ search: (s: AdminSearch) => ({ ...s, ...patch }), replace: true } as never);
  const { data: campaigns = [] } = useQuery({
    queryKey: ["filter-campaigns"],
    queryFn: async () => (await supabase.from("campaigns").select("id, name").order("name")).data ?? [],
  });
  const { data: sellers = [] } = useQuery({
    queryKey: ["filter-sellers"],
    queryFn: async () => (await supabase.from("sellers").select("id, name").order("name")).data ?? [],
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const fmt = (d: string) => d.split("-").reverse().join("/");
  const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <>
      <div className="grid gap-1">
        <Label htmlFor="f-period" className="text-xs text-muted-foreground">Período</Label>
        <Select value={search.period} onValueChange={(v) => set({ period: v as Period, ...(v === "custom" ? {} : { start: undefined, end: undefined }) })}>
          <SelectTrigger id="f-period" className="h-11 md:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{PERIODS.map((p) => <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {search.period === "custom" && (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Intervalo</span>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-11 justify-start"><CalendarDays aria-hidden /> {fmt(range.startDate)} – {fmt(range.endDate)}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" numberOfMonths={1} selected={draft} onSelect={(r) => {
                setDraft(r);
                if (r?.from && r?.to) { set({ start: toYmd(r.from), end: toYmd(r.to) }); setOpen(false); }
              }} />
            </PopoverContent>
          </Popover>
        </div>
      )}
      <div className="grid gap-1">
        <Label htmlFor="f-campaign" className="text-xs text-muted-foreground">Campanha</Label>
        <Select value={search.campaign ?? "all"} onValueChange={(v) => set({ campaign: v === "all" ? undefined : v })}>
          <SelectTrigger id="f-campaign" className="h-11 md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="f-seller" className="text-xs text-muted-foreground">Vendedor</Label>
        <Select value={search.seller ?? "all"} onValueChange={(v) => set({ seller: v === "all" ? undefined : v })}>
          <SelectTrigger id="f-seller" className="h-11 md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
