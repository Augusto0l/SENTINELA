import { useState } from "react";
import Header from "../components/Header";
import { MOCK_OCCURRENCES } from "../data/mockOccurrences";

const PAGE_SIZE = 25;

const NATURES = Array.from(new Set(MOCK_OCCURRENCES.map((o) => o.natureza))).sort();
const RA_CODES = Array.from(new Set(MOCK_OCCURRENCES.map((o) => o.raCode))).sort();

const colHead: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#475569",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "8px 12px",
  textAlign: "left",
  borderBottom: "1px solid #1e3a5f",
  whiteSpace: "nowrap",
};

const cell: React.CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  padding: "9px 12px",
  borderBottom: "1px solid rgba(30,58,95,0.5)",
  whiteSpace: "nowrap",
};

export default function Occurrences() {
  const [page, setPage] = useState(1);
  const [filterNature, setFilterNature] = useState("");
  const [filterRA, setFilterRA] = useState("");
  const [search, setSearch] = useState("");

  const filtered = MOCK_OCCURRENCES.filter((o) => {
    if (filterNature && o.natureza !== filterNature) return false;
    if (filterRA && o.raCode !== filterRA) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.id.toLowerCase().includes(q) && !o.raName.toLowerCase().includes(q) && !o.natureza.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectStyle: React.CSSProperties = {
    background: "#111d2e",
    border: "1px solid #1e3a5f",
    borderRadius: 6,
    color: "#94a3b8",
    fontSize: 12,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Ocorrências" subtitle="Base demonstrativa" />

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Title + filters */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Ocorrências</h1>
            <p style={{ fontSize: 12, color: "#475569", margin: "3px 0 0" }}>
              {filtered.length.toLocaleString("pt-BR")} registros demonstrativos · Dados não representam ocorrências policiais reais
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar ID, RA ou natureza…"
              style={{ ...selectStyle, minWidth: 200 }}
            />
            <select style={selectStyle} value={filterNature} onChange={(e) => { setFilterNature(e.target.value); setPage(1); }}>
              <option value="">Todas as naturezas</option>
              {NATURES.map((n) => <option key={n} value={n} style={{ background: "#111d2e" }}>{n}</option>)}
            </select>
            <select style={selectStyle} value={filterRA} onChange={(e) => { setFilterRA(e.target.value); setPage(1); }}>
              <option value="">Todas as regiões</option>
              {RA_CODES.map((c) => <option key={c} value={c} style={{ background: "#111d2e" }}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "#0d1a2d", border: "1px solid #1e3a5f", borderRadius: 10, overflow: "hidden", flex: 1 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#0a1525", position: "sticky", top: 0 }}>
                <tr>
                  <th style={colHead}>ID</th>
                  <th style={colHead}>Data</th>
                  <th style={colHead}>Horário</th>
                  <th style={colHead}>Natureza</th>
                  <th style={colHead}>Região Administrativa</th>
                  <th style={colHead}>Local</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((o, i) => (
                  <tr
                    key={o.id}
                    style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
                  >
                    <td style={{ ...cell, color: "#60a5fa", fontFamily: "monospace", fontSize: 11 }}>{o.id}</td>
                    <td style={cell}>{o.data}</td>
                    <td style={cell}>{o.horario}</td>
                    <td style={{ ...cell, color: "#f1f5f9", fontWeight: 500 }}>{o.natureza}</td>
                    <td style={cell}>{o.raName}</td>
                    <td style={{ ...cell, color: "#475569", fontSize: 11 }}>{o.local}</td>
                  </tr>
                ))}
                {pageData.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...cell, textAlign: "center", padding: 32, color: "#334155" }}>
                      Nenhum registro encontrado com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderTop: "1px solid #1e3a5f",
          }}>
            <span style={{ fontSize: 11, color: "#475569" }}>
              Página {page} de {totalPages} · {filtered.length.toLocaleString("pt-BR")} registros
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <PagBtn onClick={() => setPage(1)} disabled={page === 1}>«</PagBtn>
              <PagBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</PagBtn>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const n = start + i;
                return (
                  <PagBtn key={n} onClick={() => setPage(n)} active={n === page}>{n}</PagBtn>
                );
              })}
              <PagBtn onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</PagBtn>
              <PagBtn onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</PagBtn>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10, color: "#1e3a5f", textAlign: "center", fontStyle: "italic" }}>
          Dados demonstrativos — não representam ocorrências policiais reais
        </div>
      </div>
    </div>
  );
}

function PagBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28,
        border: active ? "none" : "1px solid #1e3a5f",
        borderRadius: 5,
        background: active ? "#2563eb" : disabled ? "transparent" : "transparent",
        color: active ? "#fff" : disabled ? "#1e3a5f" : "#64748b",
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
