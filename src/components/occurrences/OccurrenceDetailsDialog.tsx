import Dialog from "@/components/ui/dialog";
import Button from "@/components/ui/button";
import type { MockOccurrence } from "@/data/mockOccurrences";

export default function OccurrenceDetailsDialog({ occurrence, onClose }: { occurrence: MockOccurrence; onClose: () => void }) {
  const fields = [
    ["Identificador demonstrativo", occurrence.id], ["Natureza criminal", occurrence.natureza],
    ["Data", occurrence.data], ["Horário", occurrence.horario],
    ["Região Administrativa", `${occurrence.raName} (${occurrence.raCode})`], ["Localização", occurrence.local],
    ["Latitude", occurrence.latitude], ["Longitude", occurrence.longitude],
  ] as const;
  return (
    <Dialog title="Detalhes da ocorrência" onClose={onClose} style={{ width: "min(560px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 32px)", overflowY: "auto" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Detalhes da ocorrência</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Dados demonstrativos — não representam ocorrências policiais reais.</p>
      <dl style={{ display: "grid", gap: 12, margin: "20px 0" }}>
        {fields.map(([label, value]) => value !== undefined && value !== null && value !== "" && (
          <div key={label}>
            <dt style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</dt>
            <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
      <Button variant="outline" onClick={onClose}>Fechar detalhes</Button>
    </Dialog>
  );
}
