import { Construction } from "lucide-react";

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageTitle title={title} />
      <div className="glass flex flex-col items-center gap-2 rounded-2xl border p-10 text-center">
        <Construction className="size-8 text-primary" aria-hidden />
        <p className="font-semibold">Em breve</p>
        <p className="text-sm text-muted-foreground">Esta seção será liberada nas próximas etapas.</p>
      </div>
    </>
  );
}
