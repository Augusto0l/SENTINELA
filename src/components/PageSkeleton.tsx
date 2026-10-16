import Skeleton from "./ui/skeleton";

export default function PageSkeleton() {
  return (
    <div className="page-skeleton" role="status" aria-label="Carregando tela demonstrativa">
      <span className="sr-only">Carregando tela demonstrativa…</span>
      <Skeleton className="h-10 w-2/3" />
      <div className="kpi-grid"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
