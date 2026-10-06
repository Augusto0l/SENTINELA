interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header
      style={{
        height: 56,
        background: "#0d1626",
        borderBottom: "1px solid #1e3a5f",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 16,
        flexShrink: 0,
      }}
    >
      {/* Page title on left for context */}
      <div style={{ flex: "0 0 auto", marginRight: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{title}</span>
        {subtitle && <span style={{ fontSize: 12, color: "#334155", marginLeft: 8 }}>{subtitle}</span>}
      </div>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 480, position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#334155",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          ⌕
        </span>
        <input
          type="text"
          placeholder="Buscar ocorrência, região, natureza..."
          style={{
            width: "100%",
            background: "#080f1a",
            border: "1px solid #1e3a5f",
            borderRadius: 6,
            padding: "7px 12px 7px 32px",
            fontSize: 13,
            color: "#94a3b8",
            outline: "none",
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Notifications */}
      <button
        title="Notificações"
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          color: "#64748b",
          cursor: "pointer",
          fontSize: 18,
          padding: "4px 8px",
          lineHeight: 1,
        }}
      >
        🔔
        <span
          style={{
            position: "absolute",
            top: 2,
            right: 4,
            width: 8,
            height: 8,
            background: "#ef4444",
            borderRadius: "50%",
            border: "2px solid #0d1626",
          }}
        />
      </button>

      {/* Theme toggle */}
      <button
        title="Alternar tema"
        style={{
          background: "transparent",
          border: "none",
          color: "#64748b",
          cursor: "pointer",
          fontSize: 16,
          padding: "4px 8px",
        }}
      >
        ◑
      </button>

      {/* User */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          PA
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#94a3b8" }}>Pedro Augusto</span>
        <span style={{ fontSize: 10, color: "#334155" }}>▾</span>
      </div>
    </header>
  );
}
