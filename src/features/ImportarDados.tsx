"use client";

import { useState, useRef, useCallback } from "react";
import Header from "../components/Header";

// ─── colour tokens ────────────────────────────────────────────────────────────
const T = {
  bg:       "#080f1a",
  surface:  "#111d2e",
  surface2: "#0d1728",
  border:   "#1a3050",
  border2:  "#1e3a5f",
  text:     "#f1f5f9",
  muted:    "#94a3b8",
  dim:      "#475569",
  faint:    "#334155",
  blue:     "#2563eb",
  blueHi:   "#60a5fa",
  green:    "#22c55e",
  amber:    "#f59e0b",
};

// ─── inline icons ─────────────────────────────────────────────────────────────
const IcUpload = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={T.blueHi} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="11" stroke={T.border2} strokeWidth="1" fill="rgba(37,99,235,0.07)" />
    <path d="M12 16V9" /><polyline points="9 12 12 9 15 12" />
    <path d="M8 17h8" />
  </svg>
);
const IcDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IcImport = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IcCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="rgba(34,197,94,0.15)" />
    <polyline points="7 12 10 15 17 9" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IcDoc = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.blueHi} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);
const IcMap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.blueHi} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);
const IcSummary = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.blueHi} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const IcHistory = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.blueHi} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
  </svg>
);
const IcChevron = ({ dir = "right" }: { dir?: string }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: dir === "left" ? "rotate(180deg)" : dir === "up" ? "rotate(-90deg)" : dir === "down" ? "rotate(90deg)" : "none" }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IcFirst = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
  </svg>
);
const IcLast = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
  </svg>
);

// ─── preview data ─────────────────────────────────────────────────────────────
const PREVIEW_ROWS = [
  { data: "21/05/2026", horario: "08:15", natureza: "Furto",             ra: "Plano Piloto", bairro: "Asa Sul",       lat: "-15.7901", lon: "-47.8822" },
  { data: "21/05/2026", horario: "10:42", natureza: "Roubo",             ra: "Ceilândia",    bairro: "QNM 17",       lat: "-15.8325", lon: "-48.1153" },
  { data: "20/05/2026", horario: "22:31", natureza: "Lesão Corporal",    ra: "Taguatinga",   bairro: "C1",           lat: "-15.8340", lon: "-48.0601" },
  { data: "20/05/2026", horario: "14:05", natureza: "Tráfico de Drogas", ra: "Samambaia",    bairro: "QR 406",       lat: "-15.8679", lon: "-48.1036" },
  { data: "19/05/2026", horario: "18:47", natureza: "Ameaça",            ra: "Gama",         bairro: "Setor Central",lat: "-15.9657", lon: "-48.0371" },
];

const MAPPING_ROWS = [
  { planilha: "Data da ocorrência", sistema: "data" },
  { planilha: "Hora",               sistema: "horário" },
  { planilha: "Tipo do crime",      sistema: "natureza" },
  { planilha: "RA",                 sistema: "região_administrativa" },
  { planilha: "Local",              sistema: "endereço/local" },
];

const SYSTEM_FIELDS = ["data", "horário", "natureza", "região_administrativa", "endereço/local", "latitude", "longitude", "(ignorar)"];

const HISTORY = [
  { arquivo: "ocorrencias_df_2026.xlsx",   data: "20/05/2026 16:42", registros: "1.248", status: "Com pendências" },
  { arquivo: "ocorrencias_df_2026_1.xlsx", data: "19/05/2026 09:18", registros: "980",   status: "Concluído" },
  { arquivo: "ocorrencias_df_2026_2.xlsx", data: "18/05/2026 14:05", registros: "1.075", status: "Concluído" },
];

const FORMAT_RULES = [
  "Arquivo no padrão da documentação",
  "Colunas obrigatórias: data, horário, natureza, RA",
  "Latitude e longitude quando disponíveis",
  "Sem linhas em branco entre registros",
  "Datas no formato dd/mm/aaaa",
];

// ─── helpers ──────────────────────────────────────────────────────────────────
function CardShell({ icon, title, children, action }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 18px 12px",
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 7, flexShrink: 0,
            background: "rgba(37,99,235,0.1)", border: `1px solid rgba(96,165,250,0.12)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{icon}</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: "12px 18px 16px" }}>{children}</div>
    </div>
  );
}

function PagBtn({ children, active, disabled, onClick }: {
  children: React.ReactNode; active?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      minWidth: 28, height: 28, padding: "0 6px",
      border: active ? "none" : `1px solid ${T.border2}`,
      borderRadius: 5,
      background: active ? T.blue : "transparent",
      color: active ? "#fff" : disabled ? T.faint : T.muted,
      fontSize: 11, fontWeight: active ? 700 : 400,
      cursor: disabled ? "default" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>{children}</button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPending = status === "Com pendências";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      color: isPending ? "#f59e0b" : "#22c55e",
      background: isPending ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
      border: `1px solid ${isPending ? "rgba(245,158,11,0.25)" : "rgba(34,197,94,0.25)"}`,
      borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap",
    }}>{status}</span>
  );
}

const colH: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: T.dim,
  letterSpacing: "0.06em", textTransform: "uppercase",
  padding: "8px 12px", textAlign: "left",
  borderBottom: `1px solid ${T.border}`,
  background: "#0a1525", whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  fontSize: 12, color: T.muted, padding: "10px 12px",
  borderBottom: `1px solid rgba(26,48,80,0.5)`, whiteSpace: "nowrap",
};

// ─── main page ────────────────────────────────────────────────────────────────
export default function ImportarDados() {
  const [dragging, setDragging]   = useState(false);
  const [fileName, setFileName]   = useState("ocorrencias_df_2026.xlsx");
  const [mappings, setMappings]   = useState(() =>
    Object.fromEntries(MAPPING_ROWS.map((r) => [r.planilha, r.sistema]))
  );
  const [previewPage, setPreviewPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFileName(f.name);
  }, []);

  const selStyle: React.CSSProperties = {
    background: T.surface2, border: `1px solid ${T.border2}`,
    borderRadius: 6, color: T.muted, fontSize: 12,
    padding: "6px 28px 6px 10px", cursor: "pointer", outline: "none",
    appearance: "none", width: "100%",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Importar Dados" subtitle="Importação de arquivos estruturados" />

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px 32px" }}>
        {/* page heading */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.025em" }}>
            Importar dados
          </h1>
          <p style={{ fontSize: 13, color: T.dim, margin: "4px 0 0" }}>
            Adicione novas ocorrências ao sistema por meio de arquivos estruturados.
          </p>
        </div>

        {/* two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 12, alignItems: "start" }}>

          {/* ═══ LEFT ═══════════════════════════════════════════════════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              style={{
                background: dragging ? "rgba(37,99,235,0.06)" : T.surface,
                border: `2px dashed ${dragging ? T.blue : T.border2}`,
                borderRadius: 12,
                padding: "40px 24px 32px",
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 10, textAlign: "center",
                transition: "border-color .15s, background .15s",
                cursor: "pointer",
              }}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFileName(f.name); }} />

              {/* upload icon */}
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "rgba(37,99,235,0.08)",
                border: `1.5px solid rgba(96,165,250,0.2)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.blueHi} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
                </svg>
              </div>

              <div style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>
                Arraste um arquivo para esta área ou{" "}
                <span style={{ color: T.blueHi, textDecoration: "underline", cursor: "pointer" }}>
                  selecione um arquivo
                </span>
              </div>

              <div style={{ fontSize: 12, color: T.dim }}>
                Formatos aceitos: CSV, XLSX &nbsp;|&nbsp; Tamanho máximo: 50 MB
              </div>

              {/* format badges */}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {[".CSV", ".XLSX"].map((fmt) => (
                  <span key={fmt} style={{
                    fontSize: 12, fontWeight: 600, color: T.muted,
                    background: T.surface2, border: `1px solid ${T.border2}`,
                    borderRadius: 6, padding: "4px 14px",
                  }}>{fmt}</span>
                ))}
              </div>

              {/* baixar modelo */}
              <button
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "transparent", border: "none",
                  color: T.blueHi, fontSize: 13, cursor: "pointer",
                  marginTop: 4, textDecoration: "none",
                }}
              >
                <IcDownload /> Baixar modelo
              </button>
            </div>

            {/* Preview table */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Pré-visualização dos dados</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={colH}>Data</th>
                      <th style={{ ...colH }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          Horário
                          <svg width="12" height="8" viewBox="0 0 20 12" fill="none">
                            <line x1="2" y1="6" x2="18" y2="6" stroke={T.faint} strokeWidth="1.8" strokeLinecap="round" />
                            <polyline points="14,2 18,6 14,10" fill="none" stroke={T.faint} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </th>
                      <th style={colH}>Natureza</th>
                      <th style={colH}>Região Administrativa</th>
                      <th style={colH}>Bairro/Setor</th>
                      <th style={colH}>Latitude</th>
                      <th style={colH}>Longitude</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PREVIEW_ROWS.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 !== 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                        <td style={cell}>{r.data}</td>
                        <td style={cell}>{r.horario}</td>
                        <td style={{ ...cell, color: T.text, fontWeight: 500 }}>{r.natureza}</td>
                        <td style={cell}>{r.ra}</td>
                        <td style={cell}>{r.bairro}</td>
                        <td style={{ ...cell, fontFamily: "monospace", fontSize: 11 }}>{r.lat}</td>
                        <td style={{ ...cell, fontFamily: "monospace", fontSize: 11 }}>{r.lon}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* pagination footer */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px", borderTop: `1px solid ${T.border}`,
              }}>
                <span style={{ fontSize: 11, color: T.dim }}>Mostrando 5 de 1.248 registros</span>
                <div style={{ display: "flex", gap: 3 }}>
                  <PagBtn disabled={previewPage === 1} onClick={() => setPreviewPage(1)}><IcFirst /></PagBtn>
                  <PagBtn disabled={previewPage === 1} onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}><IcChevron dir="left" /></PagBtn>
                  {[1, 2, 3].map((n) => (
                    <PagBtn key={n} active={previewPage === n} onClick={() => setPreviewPage(n)}>{n}</PagBtn>
                  ))}
                  <PagBtn disabled><span style={{ fontSize: 11 }}>…</span></PagBtn>
                  <PagBtn onClick={() => setPreviewPage(250)}>250</PagBtn>
                  <PagBtn disabled={previewPage === 250} onClick={() => setPreviewPage((p) => Math.min(250, p + 1))}><IcChevron /></PagBtn>
                  <PagBtn disabled={previewPage === 250} onClick={() => setPreviewPage(250)}><IcLast /></PagBtn>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 2 }}>
              <button style={{
                background: "transparent", border: `1px solid ${T.border2}`,
                borderRadius: 8, color: T.muted, fontSize: 13, fontWeight: 500,
                padding: "10px 24px", cursor: "pointer",
                transition: "border-color .15s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.dim)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border2)}
              >
                Cancelar
              </button>

              <button style={{
                display: "flex", alignItems: "center", gap: 8,
                background: T.blue, border: "none", borderRadius: 8,
                color: "#fff", fontSize: 13, fontWeight: 700,
                padding: "10px 24px", cursor: "pointer",
                boxShadow: "0 2px 12px rgba(37,99,235,0.4)",
              }}>
                <IcImport /> Validar e importar
              </button>
            </div>
          </div>

          {/* ═══ RIGHT ══════════════════════════════════════════════════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Regras de formatação */}
            <CardShell icon={<IcDoc />} title="Regras de formatação">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {FORMAT_RULES.map((rule) => (
                  <div key={rule} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <IcCheck />
                    <span style={{ fontSize: 12, color: T.muted }}>{rule}</span>
                  </div>
                ))}
              </div>
            </CardShell>

            {/* Mapeamento de colunas */}
            <CardShell icon={<IcMap />} title="Mapeamento de colunas">
              {/* header row */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                padding: "4px 0 8px",
                borderBottom: `1px solid ${T.border}`,
                marginBottom: 6,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Coluna da planilha
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Campo no sistema
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {MAPPING_ROWS.map((r) => (
                  <div key={r.planilha} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span style={{ fontSize: 12, color: T.muted }}>{r.planilha}</span>
                    </div>
                    <div style={{ position: "relative" }}>
                      <select
                        value={mappings[r.planilha]}
                        onChange={(e) => setMappings((m) => ({ ...m, [r.planilha]: e.target.value }))}
                        style={selStyle}
                      >
                        {SYSTEM_FIELDS.map((f) => (
                          <option key={f} value={f} style={{ background: "#0d1728" }}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </CardShell>

            {/* Resumo da importação */}
            <CardShell icon={<IcSummary />} title="Resumo da importação">
              {[
                { label: "Arquivo selecionado",      value: fileName,          color: T.muted },
                { label: "Registros identificados",  value: "1.248",           color: T.muted },
                { label: "Campos obrigatórios válidos", value: "1.203",        color: T.green },
                { label: "Pendências",               value: "45",              color: T.amber },
                { label: "Status",                   value: "badge",           color: "" },
              ].map((row, i, arr) => (
                <div key={row.label} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: i < arr.length - 1 ? `1px solid rgba(26,48,80,0.5)` : "none",
                }}>
                  <span style={{ fontSize: 12, color: T.dim }}>{row.label}</span>
                  {row.value === "badge" ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: T.blueHi,
                      background: "rgba(37,99,235,0.1)",
                      border: "1px solid rgba(96,165,250,0.2)",
                      borderRadius: 20, padding: "2px 10px",
                    }}>Aguardando validação</span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 600, color: row.color }}>{row.value}</span>
                  )}
                </div>
              ))}
            </CardShell>

            {/* Histórico recente */}
            <CardShell
              icon={<IcHistory />}
              title="Histórico recente"
              action={
                <button style={{ background: "none", border: "none", color: T.blueHi, fontSize: 12, cursor: "pointer" }}>
                  Ver todos
                </button>
              }
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Arquivo", "Data", "Registros", "Status"].map((h) => (
                      <th key={h} style={{
                        fontSize: 10, fontWeight: 700, color: T.dim,
                        letterSpacing: "0.05em", textTransform: "uppercase",
                        padding: "4px 6px 8px", textAlign: "left",
                        borderBottom: `1px solid ${T.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HISTORY.map((row, i) => (
                    <tr key={i}>
                      <td style={{ ...cell, padding: "8px 6px", fontSize: 11, color: T.muted, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.arquivo}
                      </td>
                      <td style={{ ...cell, padding: "8px 6px", fontSize: 11, whiteSpace: "nowrap" }}>{row.data}</td>
                      <td style={{ ...cell, padding: "8px 6px", fontSize: 11, textAlign: "right" }}>{row.registros}</td>
                      <td style={{ ...cell, padding: "8px 6px", borderBottom: i < HISTORY.length - 1 ? `1px solid rgba(26,48,80,0.5)` : "none" }}>
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardShell>
          </div>
        </div>
      </div>
    </div>
  );
}
