interface BreadcrumbProps {
  selectedRA: string | null;
  onBack: () => void;
}

export default function Breadcrumb({ selectedRA, onBack }: BreadcrumbProps) {
  if (!selectedRA) return null;

  return (
    <div
      style={{
        background: "rgba(37,99,235,0.08)",
        borderBottom: "1px solid rgba(37,99,235,0.2)",
        padding: "8px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "transparent",
          border: "1px solid #1e3a5f",
          borderRadius: 5,
          color: "#94a3b8",
          fontSize: 12,
          padding: "4px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ← Voltar para visão do DF
      </button>

      <div style={{ fontSize: 13, color: "#64748b" }}>
        <span style={{ color: "#475569" }}>Distrito Federal</span>
        <span style={{ margin: "0 6px", color: "#334155" }}>›</span>
        <span style={{ color: "#93c5fd", fontWeight: 600 }}>{selectedRA}</span>
      </div>

      <div
        style={{
          marginLeft: "auto",
          fontSize: 10,
          color: "#334155",
          fontStyle: "italic",
        }}
      >
        Dados demonstrativos para protótipo
      </div>
    </div>
  );
}
