import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Confirm } from "@/components/admin/confirm";
import { ListSkeleton } from "@/components/admin/list-controls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { brl, Empty, ErrorState } from "@/routes/_authenticated/admin.index";
import { updatePlan } from "@/lib/admin-actions.functions";

type Plan = { id: string; name: string; price_cents: number; months: number; active: boolean };

export function PlansSettings() {
  const q = useQuery({
    queryKey: ["settings-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("id, name, price_cents, months, active").order("price_cents");
      if (error) throw error;
      return data as Plan[];
    },
  });

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <ListSkeleton />;
  if (!q.data.length) return <div className="glass rounded-2xl border"><Empty msg="Nenhum plano cadastrado." hint="Os planos vendidos na página de pagamento aparecem aqui." /></div>;

  return (
    <ul className="space-y-2">
      {q.data.map((p) => (
        <li key={p.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {brl(p.price_cents)} · {p.months} {p.months === 1 ? "mês" : "meses"} · {p.active ? "Ativo" : "Inativo"}
            </p>
          </div>
          <PlanEditor plan={p} />
        </li>
      ))}
    </ul>
  );
}

function PlanEditor({ plan }: { plan: Plan }) {
  const qc = useQueryClient();
  const save = useServerFn(updatePlan);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState((plan.price_cents / 100).toFixed(2).replace(".", ","));
  const [months, setMonths] = useState(String(plan.months));
  const [active, setActive] = useState(plan.active);

  const parsedCents = Math.round(Number(price.replace(",", ".")) * 100);
  const parsedMonths = Number(months);
  const valid = name.trim().length >= 2 && parsedCents > 0 && parsedMonths >= 1 && parsedMonths <= 12 && Number.isInteger(parsedMonths);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11">Editar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar plano</DialogTitle>
          <DialogDescription>Alterações valem para novas compras. A mudança fica registrada na auditoria.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`plan-name-${plan.id}`}>Nome</Label>
            <Input id={`plan-name-${plan.id}`} className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`plan-price-${plan.id}`}>Preço (R$)</Label>
            <Input id={`plan-price-${plan.id}`} className="h-11" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`plan-months-${plan.id}`}>Duração (meses, 1 a 12)</Label>
            <Input id={`plan-months-${plan.id}`} className="h-11" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`plan-active-${plan.id}`}>Plano ativo</Label>
            <Switch id={`plan-active-${plan.id}`} checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Confirm
            trigger={<Button className="h-11" disabled={!valid}>Salvar alterações</Button>}
            title="Confirmar alteração do plano?"
            description={`O plano "${name.trim()}" será salvo com preço ${brl(parsedCents)} e ${parsedMonths} ${parsedMonths === 1 ? "mês" : "meses"}.`}
            confirmLabel="Salvar"
            onConfirm={async () => {
              const r = await save({ data: { id: plan.id, name: name.trim(), price_cents: parsedCents, months: parsedMonths, active } });
              if (!r.ok) { toast.error(r.error); return; }
              toast.success("Plano salvo");
              setOpen(false);
              qc.invalidateQueries({ queryKey: ["settings-plans"] });
            }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
