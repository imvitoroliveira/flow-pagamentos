import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const PAGE_SIZE = 25;

export function Pager({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-2 pt-2 text-sm">
      <Button variant="outline" className="h-11" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-muted-foreground">
        Página {page + 1} de {pages}
      </span>
      <Button variant="outline" className="h-11" disabled={page + 1 >= pages} onClick={() => onPageChange(page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-2xl" />
      ))}
    </div>
  );
}
