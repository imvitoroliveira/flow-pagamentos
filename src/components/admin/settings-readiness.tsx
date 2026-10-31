import { Tone } from "@/components/admin/confirm";
import { ListSkeleton } from "@/components/admin/list-controls";
import { ErrorState } from "@/routes/_authenticated/admin.index";
import { useIntegrations } from "@/components/admin/settings-integrations";

export function ReadinessChecklist() {
  const q = useIntegrations();

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <ListSkeleton />;

  const required = q.data.items.filter((i) => !i.optional);
  const pending = required.filter((i) => !i.ok);
  const ready = pending.length === 0;

  return (
    <div className="glass space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Pronto para produção</p>
        {ready ? <Tone tone="ok">Tudo configurado</Tone> : <Tone tone="warn">{pending.length} pendente(s)</Tone>}
      </div>
      <ul className="space-y-2 text-sm">
        {required.map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-2">
            <span>{i.label}</span>
            {i.ok ? <Tone tone="ok">OK</Tone> : <Tone tone="warn">Pendente</Tone>}
          </li>
        ))}
      </ul>
    </div>
  );
}
