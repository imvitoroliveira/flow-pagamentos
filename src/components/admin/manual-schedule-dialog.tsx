import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Loader2, Search } from "lucide-react";
import { createManualSchedule, lookupPanelAccount } from "@/lib/admin-actions.functions";
import { manualScheduleSchema } from "@/lib/admin-schemas";
import { nextRunFor } from "@/lib/drip-schedule";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const dt = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const QUICK = [2, 3, 6];
type Found = { username: string; exp_date: string | null; open_schedules: number };

export function ManualScheduleDialog({ trigger, defaultUsername = "", defaultName = "" }: { trigger: ReactNode; defaultUsername?: string; defaultName?: string }) {
  const qc = useQueryClient();
  const lookup = useServerFn(lookupPanelAccount);
  const create = useServerFn(createManualSchedule);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(defaultUsername);
  const [found, setFound] = useState<Found | null>(null);
  const [checking, setChecking] = useState(false);
  const [months, setMonths] = useState("3");
  const [activateNow, setActivateNow] = useState(false);
  const [amount, setAmount] = useState("");
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setUsername(defaultUsername); setFound(null); setMonths("3"); setActivateNow(false); setAmount(""); setName(defaultName); setPhone(""); setNotes(""); setErrors({});
  }

  async function verify() {
    const u = username.trim();
    if (!u) { setErrors({ panel_username: "Informe o usuário do painel" }); return; }
    setChecking(true); setFound(null);
    const r = await lookup({ data: { username: u } });
    setChecking(false);
    if (!r.ok) { toast.error(r.error); return; }
    if (!r.found) { setErrors({ panel_username: "Usuário não encontrado no painel NATV" }); return; }
    setErrors({}); setUsername(r.username);
    setFound({ username: r.username, exp_date: r.exp_date, open_schedules: r.open_schedules });
  }

  const n = Number(months);
  const validN = Number.isInteger(n) && n >= 2;
  const exp = found?.exp_date ? new Date(found.exp_date) : null;
  // "Já ativei": the panel expiration already includes month 1. "Ativar agora": it will move ~1 month, so the next run is
  // computed from the real date the server gets back; here we only show an estimate.
  const nextRun = exp ? (activateNow ? new Date(nextRunFor(new Date(exp.getTime() + 30 * 86_400_000))) : new Date(nextRunFor(exp))) : null;

  async function save() {
    const parsed = manualScheduleSchema.safeParse({ panel_username: username, customer_name: name, customer_phone: phone, total_months: months, amount_reais: amount.replace(",", ".") || 0, activate_first_month_now: activateNow, notes });
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    setErrors({}); setSaving(true);
    try {
      const r = await create({ data: parsed.data });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`Agendado! Próxima renovação em ${dt(new Date(r.next_run_at))}`);
      qc.invalidateQueries({ queryKey: ["credit_schedules"] });
      qc.invalidateQueries({ queryKey: ["credit_schedules_open"] });
      qc.invalidateQueries({ queryKey: ["futuros_orders"] });
      qc.invalidateQueries({ queryKey: ["panel_credits"] });
      setOpen(false); reset();
    } catch { toast.error("Não foi possível salvar. Tente novamente."); } finally { setSaving(false); }
  }

  const err = (k: string) => errors[k] ? <p className="text-sm text-destructive" role="alert">{errors[k]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo agendamento (venda manual)</DialogTitle>
          <DialogDescription>Registre uma venda paga em dinheiro/PIX direto e agende os meses restantes.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="ms-user">Usuário no painel NATV</Label>
            <div className="flex gap-2">
              <Input id="ms-user" className="h-11" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => { setUsername(e.target.value); setFound(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); verify(); } }} />
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={verify} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="ml-2">Verificar</span>
              </Button>
            </div>
            {err("panel_username")}
            {found && (
              <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p>Usuário encontrado — vence em <strong>{exp ? dt(exp) : "data desconhecida"}</strong></p>
                  {found.open_schedules > 0 && <p className="text-amber-500">Atenção: já existe {found.open_schedules} agendamento(s) em aberto para este usuário.</p>}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="ms-months">Meses pagos</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((q) => <Button key={q} type="button" className="h-11 min-w-[44px]" variant={months === String(q) ? "default" : "outline"} aria-pressed={months === String(q)} onClick={() => setMonths(String(q))}>{q} meses</Button>)}
              <Input id="ms-months" type="number" inputMode="numeric" min={2} max={12} className="h-11 w-24" value={months} onChange={(e) => setMonths(e.target.value)} />
            </div>
            {err("total_months")}
          </div>

          <div className="space-y-2">
            <Label>1º mês</Label>
            <RadioGroup value={activateNow ? "now" : "done"} onValueChange={(v) => setActivateNow(v === "now")} className="gap-2">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border p-3 text-sm"><RadioGroupItem value="done" /> Já ativei o 1º mês manualmente no painel NATV</label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border p-3 text-sm"><RadioGroupItem value="now" /> Ativar o 1º mês agora pelo sistema (gasta 1 crédito)</label>
            </RadioGroup>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ms-amount">Valor recebido (R$)</Label>
              <Input id="ms-amount" className="h-11" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {err("amount_reais")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ms-phone">WhatsApp (opcional)</Label>
              <Input id="ms-phone" className="h-11" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-name">Nome do cliente (opcional)</Label>
            <Input id="ms-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-notes">Observação (opcional)</Label>
            <Input id="ms-notes" className="h-11" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              {validN ? <p><strong>1 crédito {activateNow ? "consumido agora" : "já ativo"}</strong> + <strong>{n - 1}</strong> crédito(s) agendado(s) para renovação automática.</p> : <p>Informe 2 meses ou mais.</p>}
              {validN && nextRun && <p className="text-muted-foreground">Próxima renovação: ~{dt(nextRun)} (2 dias antes do vencimento{activateNow ? ", estimativa" : ""}; roda às 08:00).</p>}
              {validN && !nextRun && <p className="text-muted-foreground">Clique em “Verificar” para ver a data da próxima renovação.</p>}
            </div>
          </div>

          <Button className="h-12 w-full" onClick={save} disabled={saving || checking}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Salvando…" : "Confirmar agendamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
