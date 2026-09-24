import { useState, useRef, useEffect } from "react";
import Header from "../components/Header";

// ─── types ────────────────────────────────────────────────────────────────────
type Perfil = "Administrador" | "Analista" | "Operador";
type Status = "Ativo" | "Inativo";

interface User {
  id: number;
  name: string;
  email: string;
  orgao: string;
  perfil: Perfil;
  status: Status;
  ultimoAcesso: string;
  cadastro: string;
}

// ─── mock data ────────────────────────────────────────────────────────────────
const INITIAL_USERS: User[] = [
  { id: 1, name: "Pedro Augusto",  email: "pedro.augusto@sentinela.gov.br",  orgao: "Administração",      perfil: "Administrador", status: "Ativo",   ultimoAcesso: "Hoje, 10:32",  cadastro: "01/01/2025" },
  { id: 2, name: "João Silva",     email: "joao.silva@sentinela.gov.br",     orgao: "Unidade Operacional",perfil: "Analista",      status: "Ativo",   ultimoAcesso: "Hoje, 09:15",  cadastro: "15/03/2025" },
  { id: 3, name: "Maria Souza",    email: "maria.souza@sentinela.gov.br",    orgao: "Unidade Operacional",perfil: "Operador",      status: "Ativo",   ultimoAcesso: "27/08/2026",   cadastro: "20/05/2025" },
  { id: 4, name: "Carlos Lima",    email: "carlos.lima@sentinela.gov.br",    orgao: "Administração",      perfil: "Operador",      status: "Inativo", ultimoAcesso: "15/08/2026",   cadastro: "10/02/2025" },
  { id: 5, name: "Ana Ferreira",   email: "ana.ferreira@sentinela.gov.br",   orgao: "Análise Criminal",   perfil: "Analista",      status: "Ativo",   ultimoAcesso: "Hoje, 08:47",  cadastro: "03/04/2025" },
  { id: 6, name: "Roberto Nunes",  email: "roberto.nunes@sentinela.gov.br",  orgao: "Inteligência",       perfil: "Analista",      status: "Ativo",   ultimoAcesso: "26/08/2026",   cadastro: "12/06/2025" },
];

// ─── permissions by profile ───────────────────────────────────────────────────
const ALL_PERMS = [
  "Visualizar Dashboard",
  "Visualizar Mapa Criminal",
  "Consultar ocorrências",
  "Cadastrar ocorrência",
  "Editar ocorrência",
  "Importar dados",
  "Exportar dados",
  "Gerenciar usuários",
  "Alterar permissões",
  "Configurações administrativas",
];

const PERMS_BY_PROFILE: Record<Perfil, string[]> = {
  Administrador: ALL_PERMS,
  Analista: [
    "Visualizar Dashboard",
    "Visualizar Mapa Criminal",
    "Consultar ocorrências",
    "Cadastrar ocorrência",
    "Editar ocorrência",
    "Importar dados",
    "Exportar dados",
  ],
  Operador: [
    "Visualizar Dashboard",
    "Visualizar Mapa Criminal",
    "Consultar ocorrências",
    "Cadastrar ocorrência",
  ],
};

// ─── recent activity per user ─────────────────────────────────────────────────
const ACTIVITY: Record<number, { time: string; desc: string }[]> = {
  1: [
    { time: "Hoje, 11:34",       desc: "Cadastrou a ocorrência #001924" },
    { time: "Hoje, 10:17",       desc: "Editou a ocorrência #001873" },
    { time: "27/08/2026, 16:43", desc: "Exportou relatório de ocorrências" },
    { time: "26/08/2026, 14:31", desc: "Realizou a importação #IMP-0018" },
  ],
  2: [
    { time: "Hoje, 09:15",       desc: "Consultou ocorrências de Ceilândia" },
    { time: "27/08/2026, 15:02", desc: "Cadastrou a ocorrência #001921" },
    { time: "26/08/2026, 11:45", desc: "Editou a ocorrência #001880" },
  ],
  3: [
    { time: "27/08/2026, 14:22", desc: "Cadastrou a ocorrência #001910" },
    { time: "25/08/2026, 09:30", desc: "Consultou mapa criminal" },
  ],
  4: [
    { time: "15/08/2026, 16:00", desc: "Último acesso ao sistema" },
  ],
  5: [
    { time: "Hoje, 08:47",       desc: "Exportou relatório de ocorrências" },
    { time: "27/08/2026, 13:10", desc: "Cadastrou a ocorrência #001915" },
  ],
  6: [
    { time: "26/08/2026, 17:20", desc: "Realizou a importação #IMP-0019" },
    { time: "25/08/2026, 10:05", desc: "Editou a ocorrência #001890" },
  ],
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

const AVATAR_COLORS: [string, string][] = [
  ["#2563eb", "#1d4ed8"],
  ["#7c3aed", "#6d28d9"],
  ["#0891b2", "#0e7490"],
  ["#d97706", "#b45309"],
  ["#059669", "#047857"],
  ["#db2777", "#be185d"],
];
function avatarGrad(name: string): [string, string] {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const [a, b] = avatarGrad(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${a}, ${b})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: "#fff",
    }}>
      {initials(name)}
    </div>
  );
}

const perfilColors: Record<Perfil, { bg: string; text: string; border: string }> = {
  Administrador: { bg: "rgba(37,99,235,0.12)", text: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  Analista:      { bg: "rgba(124,58,237,0.12)", text: "#a78bfa", border: "rgba(167,139,250,0.25)" },
  Operador:      { bg: "rgba(8,145,178,0.12)",  text: "#67e8f9", border: "rgba(103,232,249,0.2)"  },
};

function PerfilBadge({ p }: { p: Perfil }) {
  const c = perfilColors[p];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: c.text,
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap",
    }}>{p}</span>
  );
}

function StatusBadge({ s }: { s: Status }) {
  const active = s === "Ativo";
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      color: active ? "#22c55e" : "#64748b",
      background: active ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
      border: `1px solid ${active ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.2)"}`,
      borderRadius: 20, padding: "2px 10px",
      display: "flex", alignItems: "center", gap: 5, width: "fit-content",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: active ? "#22c55e" : "#475569", display: "inline-block" }} />
      {s}
    </span>
  );
}

const colH: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#475569",
  letterSpacing: "0.07em", textTransform: "uppercase",
  padding: "10px 14px", textAlign: "left",
  borderBottom: "1px solid #1a3050", background: "#0a1525",
  whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  fontSize: 13, color: "#94a3b8",
  padding: "13px 14px",
  borderBottom: "1px solid rgba(26,48,80,0.45)",
  verticalAlign: "middle",
};

const inputStyle: React.CSSProperties = {
  background: "#0d1728", border: "1px solid #1e3a5f",
  borderRadius: 7, color: "#f1f5f9", fontSize: 13,
  padding: "8px 12px", outline: "none", width: "100%",
  boxSizing: "border-box",
};
const selectStyle: React.CSSProperties = {
  background: "#0d1728", border: "1px solid #1e3a5f",
  borderRadius: 7, color: "#94a3b8", fontSize: 12,
  padding: "7px 10px", cursor: "pointer", outline: "none",
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: "#111d2e", border: "1px solid #1a3050", borderRadius: 10,
      padding: "16px 20px",
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? "#f1f5f9", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{label}</div>
    </div>
  );
}

// ─── Inline field label ────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</div>;
}

// ─── Action menu ──────────────────────────────────────────────────────────────
function ActionMenu({
  user, onView, onNewProfile, onToggleStatus, onClose,
}: {
  user: User;
  onView: () => void;
  onNewProfile: () => void;
  onToggleStatus: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    { label: "Visualizar usuário",         icon: "👁", action: onView },
    { label: "Editar usuário",             icon: "✏", action: onView },
    { label: "Alterar perfil e permissões",icon: "🔑", action: onNewProfile },
    { label: "Visualizar atividades",      icon: "📋", action: onView },
    { label: user.status === "Ativo" ? "Desativar usuário" : "Ativar usuário",
      icon: user.status === "Ativo" ? "⊘" : "✓",
      action: onToggleStatus,
      danger: user.status === "Ativo",
    },
  ];

  return (
    <div ref={ref} style={{
      position: "absolute", right: 0, top: "100%", zIndex: 100,
      background: "#111d2e", border: "1px solid #1e3a5f",
      borderRadius: 9, padding: "6px 0", minWidth: 210,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    }}>
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.action(); onClose(); }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", background: "none", border: "none",
            padding: "8px 16px", cursor: "pointer", textAlign: "left",
            fontSize: 13, color: item.danger ? "#f87171" : "#94a3b8",
            transition: "background .1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(37,99,235,0.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
function DetailDrawer({ user, onClose, onChangeProfile }: {
  user: User; onClose: () => void; onChangeProfile: () => void;
}) {
  const perms = PERMS_BY_PROFILE[user.perfil];
  const activity = ACTIVITY[user.id] ?? [];

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 40 }}
        onClick={onClose}
      />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 440,
        background: "#111d2e", borderLeft: "1px solid #1e3a5f",
        zIndex: 50, overflowY: "auto", display: "flex", flexDirection: "column",
      }}>
        {/* Drawer header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px",
          borderBottom: "1px solid #1a3050", flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>Detalhes do usuário</div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#64748b",
            cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* User identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={user.name} size={52} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{user.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{user.email}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <PerfilBadge p={user.perfil} />
                <StatusBadge s={user.status} />
              </div>
            </div>
          </div>

          {/* Info rows */}
          <div style={{ background: "#0d1728", border: "1px solid #1a3050", borderRadius: 9, overflow: "hidden" }}>
            {[
              { label: "Órgão / Unidade",  value: user.orgao },
              { label: "Data de cadastro", value: user.cadastro },
              { label: "Último acesso",    value: user.ultimoAcesso },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px",
                borderBottom: i < arr.length - 1 ? "1px solid #1a3050" : "none",
              }}>
                <span style={{ fontSize: 12, color: "#475569" }}>{row.label}</span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Permissions */}
          <div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 10,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Permissões</div>
              <button
                onClick={onChangeProfile}
                style={{
                  background: "none", border: "1px solid #1e3a5f", borderRadius: 6,
                  color: "#60a5fa", fontSize: 11, padding: "4px 10px", cursor: "pointer",
                }}
              >
                Alterar perfil
              </button>
            </div>
            <div style={{
              background: "#0d1728", border: "1px solid #1a3050",
              borderRadius: 9, overflow: "hidden",
            }}>
              {ALL_PERMS.map((perm, i) => {
                const enabled = perms.includes(perm);
                return (
                  <div key={perm} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 14px",
                    borderBottom: i < ALL_PERMS.length - 1 ? "1px solid rgba(26,48,80,0.5)" : "none",
                  }}>
                    <span style={{ fontSize: 12, color: enabled ? "#94a3b8" : "#334155" }}>{perm}</span>
                    {enabled ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" />
                        <polyline points="7,12 10,15 17,9" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="rgba(100,116,139,0.08)" />
                        <line x1="8" y1="8" x2="16" y2="16" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" />
                        <line x1="16" y1="8" x2="8" y2="16" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>
              Atividade recente
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {activity.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 12, position: "relative" }}>
                  {/* timeline line */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", flexShrink: 0, marginTop: 4 }} />
                    {i < activity.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: "#1e3a5f", minHeight: 24 }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>{a.time}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{a.desc}</div>
                  </div>
                </div>
              ))}
              {activity.length === 0 && (
                <div style={{ fontSize: 12, color: "#334155" }}>Nenhuma atividade registrada.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── New user modal ────────────────────────────────────────────────────────────
function NewUserModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (u: Omit<User, "id" | "ultimoAcesso" | "cadastro">) => void;
}) {
  const [nome, setNome]     = useState("");
  const [email, setEmail]   = useState("");
  const [orgao, setOrgao]   = useState("");
  const [perfil, setPerfil] = useState<Perfil>("Analista");

  function handleSave() {
    if (!nome.trim() || !email.trim()) return;
    onSave({ name: nome, email, orgao, perfil, status: "Ativo" });
    onClose();
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 460, background: "#111d2e", border: "1px solid #1e3a5f",
        borderRadius: 12, zIndex: 50, padding: "26px 28px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>Novo usuário</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <p style={{ fontSize: 12, color: "#475569", margin: "0 0 20px" }}>
          O usuário receberá acesso ao SENTINELA de acordo com o perfil selecionado.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <FieldLabel>Nome completo</FieldLabel>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")} />
          </div>
          <div>
            <FieldLabel>E-mail</FieldLabel>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@sentinela.gov.br" style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")} />
          </div>
          <div>
            <FieldLabel>Órgão / Unidade</FieldLabel>
            <input value={orgao} onChange={(e) => setOrgao(e.target.value)} placeholder="Ex: Unidade Operacional" style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")} />
          </div>
          <div>
            <FieldLabel>Perfil</FieldLabel>
            <select value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}
              style={{ ...selectStyle, width: "100%" }}>
              <option style={{ background: "#0d1728" }}>Administrador</option>
              <option style={{ background: "#0d1728" }}>Analista</option>
              <option style={{ background: "#0d1728" }}>Operador</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{
            background: "none", border: "1px solid #1e3a5f", borderRadius: 7,
            color: "#64748b", fontSize: 13, padding: "9px 20px", cursor: "pointer",
          }}>Cancelar</button>
          <button onClick={handleSave} style={{
            background: "#2563eb", border: "none", borderRadius: 7,
            color: "#fff", fontSize: 13, fontWeight: 700,
            padding: "9px 20px", cursor: "pointer",
            boxShadow: "0 2px 10px rgba(37,99,235,0.35)",
          }}>Criar usuário</button>
        </div>
      </div>
    </>
  );
}

// ─── Change profile modal ──────────────────────────────────────────────────────
function ChangeProfileModal({ user, onClose, onSave }: {
  user: User; onClose: () => void; onSave: (p: Perfil) => void;
}) {
  const [selected, setSelected] = useState<Perfil>(user.perfil);
  const perms = PERMS_BY_PROFILE[selected];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 500, background: "#111d2e", border: "1px solid #1e3a5f",
        borderRadius: 12, zIndex: 70, padding: "26px 28px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>Alterar perfil e permissões</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <Avatar name={user.name} size={36} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{user.name}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Perfil atual: {user.perfil}</div>
          </div>
        </div>

        <FieldLabel>Novo perfil</FieldLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {(["Administrador", "Analista", "Operador"] as Perfil[]).map((p) => {
            const c = perfilColors[p];
            const sel = selected === p;
            return (
              <button key={p} onClick={() => setSelected(p)} style={{
                flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                border: `2px solid ${sel ? c.text : "#1e3a5f"}`,
                background: sel ? c.bg : "#0d1728",
                color: sel ? c.text : "#64748b",
                fontSize: 12, fontWeight: sel ? 700 : 400,
                transition: "all .15s",
              }}>{p}</button>
            );
          })}
        </div>

        {/* Preview permissions */}
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Permissões do perfil selecionado
        </div>
        <div style={{
          background: "#0d1728", border: "1px solid #1a3050",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          maxHeight: 180, overflowY: "auto",
        }}>
          {ALL_PERMS.map((perm) => {
            const enabled = perms.includes(perm);
            return (
              <div key={perm} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "5px 0",
                borderBottom: "1px solid rgba(26,48,80,0.3)",
              }}>
                <span style={{ fontSize: 12, color: enabled ? "#94a3b8" : "#334155" }}>{perm}</span>
                <span style={{ fontSize: 11, color: enabled ? "#22c55e" : "#475569", fontWeight: 600 }}>
                  {enabled ? "✓" : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Warning */}
        <div style={{
          display: "flex", gap: 8, alignItems: "flex-start",
          padding: "9px 12px", background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.2)", borderRadius: 7, marginBottom: 18,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: 11, color: "#92400e" }}>
            As alterações de perfil afetam imediatamente as permissões de acesso do usuário.
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{
            background: "none", border: "1px solid #1e3a5f", borderRadius: 7,
            color: "#64748b", fontSize: 13, padding: "9px 20px", cursor: "pointer",
          }}>Cancelar</button>
          <button onClick={() => { onSave(selected); onClose(); }} style={{
            background: "#2563eb", border: "none", borderRadius: 7,
            color: "#fff", fontSize: 13, fontWeight: 700,
            padding: "9px 20px", cursor: "pointer",
            boxShadow: "0 2px 10px rgba(37,99,235,0.35)",
          }}>Salvar alterações</button>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Usuarios() {
  const [users, setUsers]             = useState<User[]>(INITIAL_USERS);
  const [search, setSearch]           = useState("");
  const [filterPerfil, setFilterPerfil] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [openMenu, setOpenMenu]       = useState<number | null>(null);
  const [detailUser, setDetailUser]   = useState<User | null>(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [changeProfileFor, setChangeProfileFor] = useState<User | null>(null);

  const filtered = users.filter((u) => {
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    if (filterPerfil && u.perfil !== filterPerfil) return false;
    if (filterStatus && u.status !== filterStatus) return false;
    return true;
  });

  const total   = users.length;
  const ativos  = users.filter((u) => u.status === "Ativo").length;
  const admins  = users.filter((u) => u.perfil === "Administrador").length;
  const inativos = users.filter((u) => u.status === "Inativo").length;

  function handleToggleStatus(id: number) {
    setUsers((prev) => prev.map((u) =>
      u.id === id ? { ...u, status: u.status === "Ativo" ? "Inativo" : "Ativo" } : u
    ));
    if (detailUser?.id === id) {
      setDetailUser((d) => d ? { ...d, status: d.status === "Ativo" ? "Inativo" : "Ativo" } : d);
    }
  }

  function handleNewUser(data: Omit<User, "id" | "ultimoAcesso" | "cadastro">) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    setUsers((prev) => [
      ...prev,
      { ...data, id: Date.now(), ultimoAcesso: "—", cadastro: `${dd}/${mm}/${yyyy}` },
    ]);
  }

  function handleChangeProfile(userId: number, newPerfil: Perfil) {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, perfil: newPerfil } : u));
    if (detailUser?.id === userId) setDetailUser((d) => d ? { ...d, perfil: newPerfil } : d);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Usuários" subtitle="Gerenciamento de usuários e permissões" />

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px 32px" }}>
        {/* ── Page heading ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.025em" }}>
              Usuários
            </h1>
            <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
              Gerencie usuários, perfis de acesso e permissões do sistema.
            </p>
          </div>
          <button
            onClick={() => setShowNewUser(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#2563eb", border: "none", borderRadius: 8,
              color: "#fff", fontSize: 13, fontWeight: 700,
              padding: "10px 18px", cursor: "pointer",
              boxShadow: "0 2px 10px rgba(37,99,235,0.35)",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo usuário
          </button>
        </div>

        {/* ── KPI cards ─────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          <KpiCard label="Total de usuários"  value={total} />
          <KpiCard label="Usuários ativos"    value={ativos}  color="#22c55e" />
          <KpiCard label="Administradores"    value={admins}  color="#60a5fa" />
          <KpiCard label="Usuários inativos"  value={inativos} color="#64748b" />
        </div>

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#334155", fontSize: 14, pointerEvents: "none" }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail"
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </div>
          <select value={filterPerfil} onChange={(e) => setFilterPerfil(e.target.value)} style={selectStyle}>
            <option value="">Todos os perfis</option>
            <option style={{ background: "#0d1728" }}>Administrador</option>
            <option style={{ background: "#0d1728" }}>Analista</option>
            <option style={{ background: "#0d1728" }}>Operador</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
            <option value="">Todos os status</option>
            <option style={{ background: "#0d1728" }}>Ativo</option>
            <option style={{ background: "#0d1728" }}>Inativo</option>
          </select>
          {(search || filterPerfil || filterStatus) && (
            <button
              onClick={() => { setSearch(""); setFilterPerfil(""); setFilterStatus(""); }}
              style={{ background: "none", border: "1px solid #1e3a5f", borderRadius: 7, color: "#64748b", fontSize: 12, padding: "7px 12px", cursor: "pointer" }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div style={{ background: "#111d2e", border: "1px solid #1a3050", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={colH}>Usuário</th>
                  <th style={colH}>Órgão / Unidade</th>
                  <th style={colH}>Perfil</th>
                  <th style={colH}>Status</th>
                  <th style={colH}>Último acesso</th>
                  <th style={{ ...colH, textAlign: "center" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.id} style={{ background: i % 2 !== 0 ? "rgba(255,255,255,0.012)" : "transparent" }}>
                    {/* User cell */}
                    <td style={cell}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <Avatar name={u.name} size={34} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...cell, color: "#94a3b8" }}>{u.orgao}</td>
                    <td style={cell}><PerfilBadge p={u.perfil} /></td>
                    <td style={cell}><StatusBadge s={u.status} /></td>
                    <td style={{ ...cell, color: "#64748b", fontSize: 12 }}>{u.ultimoAcesso}</td>
                    {/* Actions */}
                    <td style={{ ...cell, textAlign: "center", position: "relative" }}>
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <button
                          onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                          style={{
                            background: "none", border: "1px solid #1e3a5f",
                            borderRadius: 6, color: "#64748b", fontSize: 16,
                            padding: "2px 10px", cursor: "pointer",
                            lineHeight: 1, letterSpacing: "0.1em",
                          }}
                        >
                          •••
                        </button>
                        {openMenu === u.id && (
                          <ActionMenu
                            user={u}
                            onView={() => setDetailUser(u)}
                            onNewProfile={() => setChangeProfileFor(u)}
                            onToggleStatus={() => handleToggleStatus(u.id)}
                            onClose={() => setOpenMenu(null)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...cell, textAlign: "center", padding: 40, color: "#334155" }}>
                      Nenhum usuário encontrado com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div style={{
            padding: "10px 16px", borderTop: "1px solid #1a3050",
            fontSize: 11, color: "#475569",
          }}>
            {filtered.length} de {users.length} usuários
          </div>
        </div>
      </div>

      {/* ── Modals & drawers ──────────────────────────────────────────── */}
      {detailUser && (
        <DetailDrawer
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onChangeProfile={() => setChangeProfileFor(detailUser)}
        />
      )}

      {changeProfileFor && (
        <ChangeProfileModal
          user={changeProfileFor}
          onClose={() => setChangeProfileFor(null)}
          onSave={(p) => handleChangeProfile(changeProfileFor.id, p)}
        />
      )}

      {showNewUser && (
        <NewUserModal
          onClose={() => setShowNewUser(false)}
          onSave={handleNewUser}
        />
      )}
    </div>
  );
}
