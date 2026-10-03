import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return toast.error("E-mail ou senha inválidos");
      navigate({ to: "/admin" });
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/admin` } });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Conta criada. Confirme pelo link enviado ao seu e-mail.");
      setMode("login");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="mb-1 text-2xl font-bold">Admin NATV</h1>
      <p className="mb-6 text-sm text-muted-foreground">{mode === "login" ? "Entre com sua conta de administrador." : "Criar conta (o primeiro cadastro vira admin)."}</p>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw">Senha</Label>
          <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-gradient-primary">
          {mode === "login" ? "Entrar" : "Criar conta"}
        </Button>
      </form>
      <button className="mt-4 text-sm text-muted-foreground hover:text-primary" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Criar conta de administrador" : "Já tenho conta"}
      </button>
    </main>
  );
}
