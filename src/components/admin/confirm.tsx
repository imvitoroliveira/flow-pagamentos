import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** AlertDialog wrapper used for destructive / money-changing admin actions. */
export function Confirm({ trigger, title, description, confirmLabel = "Confirmar", onConfirm }: {
  trigger: React.ReactNode; title: string; description: React.ReactNode; confirmLabel?: string; onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Cancelar</AlertDialogCancel>
          <AlertDialogAction className="h-11" disabled={busy} onClick={async (e) => {
            e.preventDefault(); setBusy(true);
            try { await onConfirm(); setOpen(false); } finally { setBusy(false); }
          }}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Small text badge with semantic tone. */
export function Tone({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted" | "info"; children: React.ReactNode }) {
  const cls = {
    ok: "border-success/40 bg-success/15 text-success",
    warn: "border-warning/40 bg-warning/15 text-warning",
    bad: "border-destructive/40 bg-destructive/15 text-destructive",
    info: "border-primary/40 bg-primary/15 text-primary",
    muted: "border-border bg-muted text-muted-foreground",
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
