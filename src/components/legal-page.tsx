import type { ReactNode } from "react";

/** Shared shell for public legal pages (Termos, Privacidade). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <p className="font-display text-lg font-extrabold tracking-widest text-primary">NATV</p>
        <h1 className="mt-6 font-display text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última atualização: {updated}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
        <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>Este site não é afiliado ao Facebook, Instagram ou à Meta Platforms, Inc.</p>
          <p className="mt-1">© {new Date().getFullYear()} NATV. Todos os direitos reservados.</p>
        </footer>
      </div>
    </main>
  );
}
