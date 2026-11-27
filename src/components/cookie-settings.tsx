import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { readChoice, saveChoices } from "@/lib/consent";

/** Until the builder settles regional banner coverage, settings are optional and unknown regions stay blocked. */
export function CookieSettings() {
  const [open,setOpen]=useState(false);
  const [ads,setAds]=useState(false);
  const [analytics,setAnalytics]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  const panel=useRef<HTMLDivElement>(null);
  const gpc=typeof navigator!=="undefined" && (navigator as unknown as {globalPrivacyControl?:boolean}).globalPrivacyControl===true;
  useEffect(()=> {if(open) panel.current?.focus();},[open]);
  async function save(ad:boolean,an:boolean) {
    setBusy(true);setError(false);
    try {
      const r=await fetch("/api/public/advertising-choice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({choice:ad&&!gpc?"granted":"denied"})});
      if(!r.ok) throw new Error();
      saveChoices({advertising:ad&&!gpc?"granted":"denied",analytics:an&&!gpc?"granted":"denied"});
      setOpen(false);
    } catch {setError(true);} finally {setBusy(false);}
  }
  return <>
    <Button variant="link" size="sm" onClick={()=>{setAds(readChoice("advertising")==="granted");setAnalytics(readChoice("analytics")==="granted");setOpen(true);}}>Preferências de cookies</Button>
    {open && <div ref={panel} tabIndex={-1} role="dialog" aria-label="Preferências de privacidade" className="fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-lg space-y-4 rounded-lg border border-border bg-background p-5 text-left text-foreground shadow-lg">
      <h2 className="font-semibold">Sua privacidade</h2>
      <p className="text-sm text-muted-foreground">Cookies de publicidade medem e melhoram anúncios. Estatísticas ajudam a entender visitas. <Link to="/privacidade" className="underline">Política de Privacidade</Link></p>
      {gpc && <p className="text-sm">O sinal de privacidade do seu navegador bloqueia o rastreamento.</p>}
      <p className="text-sm">Necessários — sempre ativos</p>
      <div className="flex items-center justify-between gap-3"><Label htmlFor="consent-analytics">Estatísticas, fornecidas pela Lovable</Label><Switch id="consent-analytics" checked={analytics&&!gpc} disabled={gpc||busy} onCheckedChange={setAnalytics}/></div>
      <div className="flex items-center justify-between gap-3"><Label htmlFor="consent-ads">Publicidade, fornecida pela Meta</Label><Switch id="consent-ads" checked={ads&&!gpc} disabled={gpc||busy} onCheckedChange={setAds}/></div>
      {error && <p role="alert" className="text-sm text-destructive">Não foi possível salvar. Tente novamente.</p>}
      <div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={busy} onClick={()=>save(true,true)}>Aceitar tudo</Button><Button variant="outline" disabled={busy} onClick={()=>save(false,false)}>Recusar tudo</Button></div>
      <div className="flex justify-between"><Button variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>Fechar</Button><Button disabled={busy} onClick={()=>save(ads,analytics)}>Salvar preferências</Button></div>
    </div>}
  </>;
}
