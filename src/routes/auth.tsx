import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Admin NATV" },
      { name: "description", content: "Acesso restrito à administração NATV." },
      { property: "og:title", content: "Entrar — Admin NATV" },
      { property: "og:description", content: "Acesso restrito à administração NATV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) { setLoading(false); setMsg("E-mail ou senha inválidos"); return; }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (!isAdmin) {
      await supabase.auth.signOut();
      setLoading(false); setMsg("Esta conta não tem acesso ao painel");
      return;
    }
    navigate({ to: "/admin" });
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    toast.success("Se o e-mail estiver cadastrado, enviamos um link de redefinição.");
    setMode("login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="mb-1 font-display text-2xl font-bold">Admin NATV</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {mode === "login" ? "Entre com sua conta de administrador." : "Informe seu e-mail para receber o link de redefinição."}
      </p>
      <form onSubmit={mode === "login" ? login : forgot} className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" required className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode === "login" && (
          <div className="space-y-1.5">
            <Label htmlFor="pw">Senha</Label>
            <Input id="pw" type="password" autoComplete="current-password" required className="h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
        <Button type="submit" disabled={loading} className="h-11 w-full bg-gradient-primary">
          {loading && <Loader2 className="animate-spin" />}
          {mode === "login" ? "Entrar" : "Enviar link"}
        </Button>
      </form>
      <button type="button" className="mt-4 min-h-11 text-sm text-muted-foreground hover:text-primary" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setMsg(null); }}>
        {mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}
      </button>
    </main>
  );
}
