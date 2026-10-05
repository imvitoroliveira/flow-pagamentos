import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Admin NATV" },
      { name: "description", content: "Defina uma nova senha para o painel NATV." },
      { property: "og:title", content: "Redefinir senha — Admin NATV" },
      { property: "og:description", content: "Defina uma nova senha para o painel NATV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setMsg("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (pw !== pw2) { setMsg("As senhas não conferem."); return; }
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) { setMsg("Link inválido ou expirado. Solicite um novo."); return; }
    toast.success("Senha atualizada.");
    navigate({ to: "/admin" });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="mb-6 font-display text-2xl font-bold">Nova senha</h1>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="pw">Nova senha</Label>
          <Input id="pw" type="password" autoComplete="new-password" className="h-11" required value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw2">Confirmar senha</Label>
          <Input id="pw2" type="password" autoComplete="new-password" className="h-11" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
        <Button type="submit" disabled={loading} className="h-11 w-full bg-gradient-primary">
          {loading && <Loader2 className="animate-spin" />} Salvar senha
        </Button>
      </form>
    </main>
  );
}
