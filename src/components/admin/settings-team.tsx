import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Confirm } from "@/components/admin/confirm";
import { ListSkeleton } from "@/components/admin/list-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dtSP, Empty, ErrorState } from "@/routes/_authenticated/admin.index";
import { inviteAdmin, revokeAdmin } from "@/lib/admin-actions.functions";

type Admin = { user_id: string; email: string | null; created_at: string };

export function TeamSettings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings-admins"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_admins");
      if (error) throw error;
      return (data ?? []) as Admin[];
    },
  });
  const invite = useServerFn(inviteAdmin);
  const revoke = useServerFn(revokeAdmin);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["settings-admins"] });

  const send = async () => {
    setSending(true);
    try {
      const r = await invite({ data: { email, redirectTo: window.location.origin } });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.invited ? "Convite enviado" : "Permissão concedida a uma conta existente");
      setEmail("");
      refresh();
    } catch {
      toast.error("Não foi possível enviar o convite");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        className="glass flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => { e.preventDefault(); if (email) send(); }}
      >
        <div className="grid flex-1 gap-2">
          <Label htmlFor="invite-email">E-mail do novo administrador</Label>
          <Input id="invite-email" type="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" className="h-11" disabled={sending || !email}>
          {sending ? "Enviando..." : "Convidar"}
        </Button>
      </form>

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <ListSkeleton />
      ) : !q.data.length ? (
        <div className="glass rounded-2xl border"><Empty msg="Nenhum administrador." hint="Convide alguém pelo campo acima." /></div>
      ) : (
        <ul className="space-y-2">
          {q.data.map((a) => (
            <li key={a.user_id} className="glass flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 text-sm">
              <div className="min-w-0">
                <p className="break-all font-medium">{a.email ?? "Sem e-mail"}</p>
                <p className="text-xs text-muted-foreground">Desde {dtSP(a.created_at)}</p>
              </div>
              <Confirm
                trigger={<Button variant="ghost" className="h-11 text-destructive">Remover acesso</Button>}
                title="Remover acesso de administrador?"
                description={`${a.email ?? "Este usuário"} deixará de acessar o painel.`}
                confirmLabel="Remover"
                onConfirm={async () => {
                  const r = await revoke({ data: { user_id: a.user_id } });
                  if (!r.ok) { toast.error(r.error); return; }
                  toast.success("Acesso removido");
                  refresh();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
