import { RA_LIST } from "../data/mockData";

interface RankingListProps {
  limit?: number;
  selectedRA?: string | null;
  onSelect?: (nome: string) => void;
}

export default function RankingList({ limit = 5, selectedRA, onSelect }: RankingListProps) {
  const sorted = [...RA_LIST].sort((a, b) => b.occurrence_count - a.occurrence_count).slice(0, limit);
  const max = sorted[0]?.occurrence_count ?? 1;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
        Ranking por ocorrências
      </div>
      {sorted.map((ra, i) => {
        const pct = (ra.occurrence_count / max) * 100;
        const active = selectedRA === ra.nomeDisplay;
        return (
          <div
            key={ra.codigo}
            onClick={() => onSelect?.(ra.codigo)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              cursor: onSelect ? "pointer" : "default",
              padding: "4px 0",
              borderRadius: 4,
            }}
          >
            <span
              style={{
                width: 18,
                fontSize: 11,
                fontWeight: 700,
                color: i === 0 ? "#ef4444" : i === 1 ? "#f97316" : "#64748b",
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? "#93c5fd" : "#94a3b8",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 2,
                }}
              >
                {ra.nomeDisplay}
              </div>
              <div
                style={{
                  height: 3,
                  background: "#0d1626",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: i === 0 ? "#ef4444" : i === 1 ? "#f97316" : "#2563eb",
                    borderRadius: 2,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                color: "#64748b",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ra.occurrence_count.toLocaleString("pt-BR")}
            </span>
          </div>
        );
      })}
      {limit < RA_LIST.length && (
        <button
          style={{
            background: "transparent",
            border: "1px solid #1e3a5f",
            borderRadius: 5,
            color: "#64748b",
            fontSize: 11,
            padding: "5px 10px",
            cursor: "pointer",
            marginTop: 4,
            width: "100%",
          }}
        >
          Ver todas as 37 RAs
        </button>
      )}
    </div>
  );
}
