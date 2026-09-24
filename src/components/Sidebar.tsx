import { SentinelaIcon, SentinelaBrand } from "./SentinelaLogo";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const navGroups = [
  {
    label: "VISÃO GERAL",
    items: [
      { key: "dashboard", label: "Dashboard", icon: "⊞" },
      { key: "crime-map", label: "Mapa Criminal", icon: "◎" },
    ],
  },
  {
    label: "OCORRÊNCIAS",
    items: [
      { key: "occurrences", label: "Ocorrências", icon: "≡" },
      { key: "new", label: "Nova Ocorrência", icon: "+" },
      { key: "import", label: "Importar Dados", icon: "↑" },
    ],
  },
  {
    label: "GESTÃO",
    items: [
      { key: "users", label: "Usuários", icon: "◯" },
      { key: "settings", label: "Configurações", icon: "⚙" },
    ],
  },
];

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      style={{
        width: collapsed ? 56 : 240,
        minWidth: collapsed ? 56 : 240,
        background: "#0d1626",
        borderRight: "1px solid #1e3a5f",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: collapsed ? "16px 0" : "16px 18px",
          borderBottom: "1px solid #1e3a5f",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        {collapsed ? <SentinelaIcon size={34} /> : <SentinelaBrand iconSize={34} />}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
        {navGroups.map((group) => (
          <div key={group.label} style={{ marginBottom: 8 }}>
            {!collapsed && (
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: "#334155",
                  letterSpacing: "0.1em",
                  padding: "10px 20px 4px",
                }}
              >
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = currentPage === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: collapsed ? "9px 0" : "9px 20px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    background: active ? "rgba(37,99,235,0.15)" : "transparent",
                    border: "none",
                    borderLeft: active ? "3px solid #2563eb" : "3px solid transparent",
                    color: active ? "#93c5fd" : "#64748b",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    transition: "all 0.15s",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
                  }}
                >
                  <span style={{ fontSize: 15, width: 18, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div
        style={{
          padding: collapsed ? "14px 0" : "14px 16px",
          borderTop: "1px solid #1e3a5f",
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          PA
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Pedro Augusto
            </div>
            <div style={{ fontSize: 11, color: "#475569" }}>Administrador</div>
          </div>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        style={{
          position: "absolute",
          right: -12,
          top: "50%",
          transform: "translateY(-50%)",
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#0d1626",
          border: "1px solid #1e3a5f",
          color: "#475569",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          zIndex: 20,
        }}
      >
        {collapsed ? "▶" : "◀"}
      </button>
    </aside>
  );
}
