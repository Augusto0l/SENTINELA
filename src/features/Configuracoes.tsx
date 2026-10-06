"use client";

import { useState } from "react";
import Header from "../components/Header";

// ─── Inline SVG icons ──────────────────────────────────────────────────────
const IcPerfil = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);
const IcPrefs = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const IcPalette = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="1.5" fill="#60a5fa" stroke="none" />
    <circle cx="17.5" cy="10.5" r="1.5" fill="#60a5fa" stroke="none" />
    <circle cx="8.5" cy="7.5" r="1.5" fill="#60a5fa" stroke="none" />
    <circle cx="6.5" cy="12.5" r="1.5" fill="#60a5fa" stroke="none" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);
const IcLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);
const IcBell = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const IcShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IcSave = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
const IcCheck = () => (
  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
    <polyline points="2,7 6,11 12,3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IcLogout = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// ─── Theme preview SVG icons ───────────────────────────────────────────────
const MonitorClaro = () => (
  <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
    <rect x="4" y="2" width="48" height="34" rx="4" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
    <rect x="9" y="7" width="38" height="24" rx="2" fill="#e2e8f0" />
    <rect x="9" y="7" width="10" height="24" rx="1" fill="#cbd5e1" />
    <rect x="22" y="9" width="22" height="4" rx="1" fill="#94a3b8" opacity=".5" />
    <rect x="22" y="15" width="16" height="3" rx="1" fill="#94a3b8" opacity=".35" />
    <rect x="20" y="36" width="16" height="3" rx="1" fill="#cbd5e1" />
    <rect x="16" y="39" width="24" height="2" rx="1" fill="#e2e8f0" />
  </svg>
);
const MonitorEscuro = () => (
  <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
    <rect x="4" y="2" width="48" height="34" rx="4" fill="#0d1a2d" stroke="#1e3a5f" strokeWidth="1.5" />
    <rect x="9" y="7" width="38" height="24" rx="2" fill="#0a1525" />
    <rect x="9" y="7" width="10" height="24" rx="1" fill="#081322" />
    <rect x="22" y="9" width="22" height="4" rx="1" fill="#1e3a5f" opacity=".8" />
    <rect x="22" y="15" width="16" height="3" rx="1" fill="#1e3a5f" opacity=".5" />
    <rect x="20" y="36" width="16" height="3" rx="1" fill="#1e3a5f" />
    <rect x="16" y="39" width="24" height="2" rx="1" fill="#0d1a2d" />
  </svg>
);
const MonitorSistema = () => (
  <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
    <rect x="4" y="2" width="48" height="34" rx="4" fill="#0d1a2d" stroke="#1e3a5f" strokeWidth="1.5" />
    <clipPath id="sc"><rect x="4" y="2" width="48" height="34" rx="4" /></clipPath>
    <rect x="4" y="2" width="24" height="34" fill="#f1f5f9" clipPath="url(#sc)" />
    <rect x="9" y="7" width="14" height="24" rx="2" fill="#e2e8f0" clipPath="url(#sc)" />
    <rect x="9" y="7" width="5" height="24" rx="1" fill="#cbd5e1" clipPath="url(#sc)" />
    <rect x="28" y="7" width="19" height="24" rx="2" fill="#0a1525" />
    <rect x="28" y="7" width="5" height="24" rx="1" fill="#081322" />
    <rect x="20" y="36" width="16" height="3" rx="1" fill="#1e3a5f" />
    <rect x="16" y="39" width="24" height="2" rx="1" fill="#0d1a2d" />
  </svg>
);

// ─── Toggle pill ────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 42, height: 24, borderRadius: 12, border: "none",
        background: on ? "#2563eb" : "#1e3a5f",
        position: "relative", cursor: "pointer", flexShrink: 0,
        transition: "background .18s ease", padding: 0, outline: "none",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: on ? "#fff" : "#64748b",
        transition: "left .18s ease",
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      }} />
    </button>
  );
}

// ─── Card shell ─────────────────────────────────────────────────────────────
function Card({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <section style={{
      background: "#111d2e",
      border: "1px solid #1a3050",
      borderRadius: 12,
      marginBottom: 12,
      overflow: "hidden",
    }}>
      {/* header row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "18px 22px 16px",
        borderBottom: "1px solid #1a3050",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: "rgba(37,99,235,0.1)",
          border: "1px solid rgba(96,165,250,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.01em" }}>{title}</div>
          <div style={{ fontSize: 11.5, color: "#475569", marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ padding: "4px 22px 18px" }}>
        {children}
      </div>
    </section>
  );
}

// ─── Perfil / Segurança field row ──────────────────────────────────────────
function FieldRow({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange?: (v: string) => void; type?: string;
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "160px 1fr",
      alignItems: "center", gap: 14,
      padding: "11px 0",
      borderBottom: "1px solid rgba(26,48,80,0.6)",
    }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "#0d1728",
          border: "1px solid #1e3a5f",
          borderRadius: 7, color: "#f1f5f9", fontSize: 13,
          padding: "8px 12px", outline: "none",
          letterSpacing: type === "password" ? "0.12em" : "normal",
          transition: "border-color .15s",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
      />
    </div>
  );
}

// ─── Switch row ─────────────────────────────────────────────────────────────
function SwitchRow({ label, on, onChange, last }: {
  label: string; on: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 0",
      borderBottom: last ? "none" : "1px solid rgba(26,48,80,0.6)",
    }}>
      <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

// ─── Session info row ───────────────────────────────────────────────────────
function InfoRow({ label, value, badge, last }: {
  label: string; value: string; badge?: boolean; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 0",
      borderBottom: last ? "none" : "1px solid rgba(26,48,80,0.6)",
    }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      {badge ? (
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#22c55e",
          background: "rgba(34,197,94,0.1)",
          border: "1px solid rgba(34,197,94,0.25)",
          borderRadius: 20, padding: "2px 11px",
        }}>{value}</span>
      ) : (
        <span style={{ fontSize: 13, color: "#94a3b8" }}>{value}</span>
      )}
    </div>
  );
}

// ─── Theme card ─────────────────────────────────────────────────────────────
function ThemeCard({ label, selected, onSelect, preview }: {
  label: string; selected: boolean; onSelect: () => void; preview: React.ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        flex: 1, position: "relative",
        background: selected ? "rgba(37,99,235,0.07)" : "#0d1728",
        border: `2px solid ${selected ? "#2563eb" : "#1e3a5f"}`,
        borderRadius: 10, cursor: "pointer",
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: 10,
        padding: "18px 10px 14px",
        transition: "border-color .15s, background .15s",
      }}
    >
      {selected && (
        <div style={{
          position: "absolute", top: 7, right: 7,
          width: 20, height: 20, borderRadius: "50%",
          background: "#2563eb",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <IcCheck />
        </div>
      )}
      {preview}
      <span style={{
        fontSize: 12, fontWeight: selected ? 600 : 400,
        color: selected ? "#60a5fa" : "#64748b",
      }}>{label}</span>
    </button>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Configuracoes() {
  // Perfil
  const [nome, setNome]         = useState("Pedro Augusto");
  const [email, setEmail]       = useState("pedro.augusto@sentinela.gov.br");
  const [cargo, setCargo]       = useState("Administrador do sistema");

  // Segurança
  const [senhaAtual, setSenhaAtual]         = useState("sentinela2025");
  const [novaSenha, setNovaSenha]           = useState("sentinela2025");
  const [confirmarSenha, setConfirmarSenha] = useState("sentinela2025");
  const [mfa, setMfa]                       = useState(true);

  // Preferências
  const [compacto, setCompacto]                 = useState(false);
  const [exibirId, setExibirId]                 = useState(true);
  const [confirmarExcluir, setConfirmarExcluir] = useState(true);
  const [carregarMapa, setCarregarMapa]         = useState(true);

  // Notificações
  const [notifCriticas, setNotifCriticas]       = useState(true);
  const [notifImport, setNotifImport]           = useState(true);
  const [notifUsuarios, setNotifUsuarios]       = useState(false);
  const [notifRelatorios, setNotifRelatorios]   = useState(true);

  // Aparência
  const [tema, setTema] = useState<"claro" | "escuro" | "sistema">("escuro");

  // Save state
  const [saving, setSaving]   = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  async function handleSave() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSaving(false);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2600);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Configurações" subtitle="Gerencie preferências da sua conta" />

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px 36px" }}>
        {/* ── Page heading ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.025em" }}>
              Configurações
            </h1>
            <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
              Gerencie as preferências e configurações da sua conta.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 2 }}>
            {savedOk && (
              <span style={{ fontSize: 12, color: "#22c55e", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Alterações salvas
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#2563eb", border: "none", borderRadius: 8,
                color: "#fff", fontSize: 13, fontWeight: 700,
                padding: "10px 18px", cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1, transition: "opacity .15s",
                boxShadow: "0 2px 10px rgba(37,99,235,0.35)",
              }}
            >
              <IcSave />
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>

        {/* ── Two-column grid ──────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>

          {/* ═══ LEFT COLUMN ═══ */}
          <div>
            {/* Perfil */}
            <Card icon={<IcPerfil />} title="Perfil" subtitle="Informações pessoais e da conta">
              <FieldRow label="Nome completo" value={nome} onChange={setNome} />
              <FieldRow label="E-mail"        value={email} onChange={setEmail} type="email" />
              <FieldRow label="Cargo / Função" value={cargo} onChange={setCargo} />
            </Card>

            {/* Preferências */}
            <Card icon={<IcPrefs />} title="Preferências do sistema" subtitle="Configurações gerais da plataforma">
              <SwitchRow label="Modo compacto de tabela"       on={compacto}         onChange={setCompacto} />
              <SwitchRow label="Exibir ID das ocorrências"     on={exibirId}         onChange={setExibirId} />
              <SwitchRow label="Confirmar antes de excluir"    on={confirmarExcluir} onChange={setConfirmarExcluir} />
              <SwitchRow label="Carregar mapa automaticamente" on={carregarMapa}     onChange={setCarregarMapa} last />
            </Card>

            {/* Aparência */}
            <Card icon={<IcPalette />} title="Aparência" subtitle="Personalize a aparência da plataforma">
              <div style={{ paddingTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>
                  Tema da interface
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  <ThemeCard label="Claro"   selected={tema === "claro"}   onSelect={() => setTema("claro")}   preview={<MonitorClaro />} />
                  <ThemeCard label="Escuro"  selected={tema === "escuro"}  onSelect={() => setTema("escuro")}  preview={<MonitorEscuro />} />
                  <ThemeCard label="Sistema" selected={tema === "sistema"} onSelect={() => setTema("sistema")} preview={<MonitorSistema />} />
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px",
                  background: "rgba(37,99,235,0.04)",
                  border: "1px solid rgba(30,58,95,0.5)",
                  borderRadius: 7,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span style={{ fontSize: 11.5, color: "#475569" }}>
                    As alterações de tema são aplicadas automaticamente.
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* ═══ RIGHT COLUMN ═══ */}
          <div>
            {/* Segurança */}
            <Card icon={<IcLock />} title="Segurança" subtitle="Gerencie sua senha e autenticação">
              <FieldRow label="Senha atual"     value={senhaAtual}     onChange={setSenhaAtual}     type="password" />
              <FieldRow label="Nova senha"      value={novaSenha}      onChange={setNovaSenha}      type="password" />
              <FieldRow label="Confirmar senha" value={confirmarSenha} onChange={setConfirmarSenha} type="password" />

              {/* MFA toggle row */}
              <div style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "15px 0 12px",
                borderBottom: "1px solid rgba(26,48,80,0.6)",
              }}>
                <Toggle on={mfa} onChange={setMfa} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                    Autenticação em dois fatores
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                    Ativada via aplicativo autenticador
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14 }}>
                <button style={{
                  background: "#2563eb", border: "none", borderRadius: 7,
                  color: "#fff", fontSize: 13, fontWeight: 600,
                  padding: "8px 18px", cursor: "pointer",
                  boxShadow: "0 1px 6px rgba(37,99,235,0.3)",
                }}>
                  Alterar senha
                </button>
              </div>
            </Card>

            {/* Notificações */}
            <Card icon={<IcBell />} title="Notificações" subtitle="Configure como você recebe alertas">
              <SwitchRow label="Variações críticas de indicadores" on={notifCriticas}  onChange={setNotifCriticas} />
              <SwitchRow label="Erros em importações de dados"     on={notifImport}    onChange={setNotifImport} />
              <SwitchRow label="Novos usuários cadastrados"        on={notifUsuarios}  onChange={setNotifUsuarios} />
              <SwitchRow label="Relatórios disponíveis"            on={notifRelatorios} onChange={setNotifRelatorios} last />
            </Card>

            {/* Sessão e acesso */}
            <Card icon={<IcShield />} title="Sessão e acesso" subtitle="Informações sobre sua sessão atual">
              <InfoRow label="Último acesso"     value="24/05/2025 às 09:42" />
              <InfoRow label="Dispositivo ativo" value="Windows • Chrome 124.0.6367.91" />
              <InfoRow label="Endereço IP"        value="177.131.21.45 • Brasil" />
              <InfoRow label="Sessão iniciada"    value="Ativa" badge last />

              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14 }}>
                <button
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: "transparent",
                    border: "1px solid #1e3a5f",
                    borderRadius: 7, color: "#64748b", fontSize: 13,
                    padding: "8px 14px", cursor: "pointer",
                    transition: "border-color .15s, color .15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#475569"; e.currentTarget.style.color = "#94a3b8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.color = "#64748b"; }}
                >
                  <IcLogout />
                  Encerrar todas as sessões
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
