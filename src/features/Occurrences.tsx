import { useState } from "react";
import Link from "next/link";
import { useOperations } from "@/components/OperationalProvider";
import { canWrite, canInactivate } from "@/data/demoPermissions";
import OccurrenceForm from "@/components/occurrences/OccurrenceForm";
import Dialog from "@/components/ui/dialog";
import Button from "@/components/ui/button";
import { useDemoToast } from "@/components/DemoProvider";
import Header from "@/components/Header";
import { MOCK_OCCURRENCES, type MockOccurrence } from "@/data/mockOccurrences";
import { RA_LIST } from "@/data/mockData";
import OccurrenceDetailsDialog from "@/components/occurrences/OccurrenceDetailsDialog";
import { emptyOccurrenceFilters, queryOccurrences, type OccurrenceSort, type SortColumn } from "@/data/occurrenceQuery";

const PAGE_SIZE = 25;

const NATURES = Array.from(new Set(MOCK_OCCURRENCES.map((o) => o.natureza))).sort();
const RA_CODES = RA_LIST.map(ra => ra.codigo);

const colHead: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--color-text-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "8px 12px",
  textAlign: "left",
  borderBottom: "1px solid var(--theme-1e3a5f)",
  whiteSpace: "nowrap",
};

const cell: React.CSSProperties = {
  fontSize: 12,
  color: "var(--theme-94a3b8)",
  padding: "9px 12px",
  borderBottom: "1px solid rgba(30,58,95,0.5)",
  whiteSpace: "nowrap",
};

export default function Occurrences() {
  const operations = useOperations();
  const notify = useDemoToast();
  const [editing, setEditing] = useState<MockOccurrence | null>(null);
  const [deactivating, setDeactivating] = useState<MockOccurrence | null>(null);
  const [reason, setReason] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const baseIds = new Set(MOCK_OCCURRENCES.map(record => record.id));
  const records = [...MOCK_OCCURRENCES.map(record => operations.records[record.id] ?? record), ...Object.values(operations.records).filter(record => !baseIds.has(record.id))].filter(record => showInactive || !operations.inactive[record.id]);
  const [page, setPage] = useState(1);
  const [filterNature, setFilterNature] = useState("");
  const [filterRA, setFilterRA] = useState("");
  const [search, setSearch] = useState("");

  const [sort, setSort] = useState<OccurrenceSort | null>(null);
  const [selected, setSelected] = useState<MockOccurrence | null>(null);
  const { total, totalPages, page: currentPage, records: pageData } = queryOccurrences(records, { search, nature: filterNature, ra: filterRA }, sort, page, PAGE_SIZE);
  function changeSort(column: SortColumn) {
    setSort({ column, direction: sort?.column === column && sort.direction === "asc" ? "desc" : "asc" });
    setPage(1);
  }
  function clearFilters() {
    const cleared = emptyOccurrenceFilters();
    setSearch(cleared.search); setFilterRA(cleared.ra); setFilterNature(cleared.nature); setPage(1);
  }

  const selectStyle: React.CSSProperties = {
    background: "var(--theme-111d2e)",
    border: "1px solid var(--theme-1e3a5f)",
    borderRadius: 6,
    color: "var(--theme-94a3b8)",
    fontSize: 12,
    padding: "6px 10px",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Ocorrências" subtitle="Base demonstrativa" />

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Title + filters */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--theme-f1f5f9)", margin: 0 }}>Ocorrências</h1>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "3px 0 0" }}>
              {total.toLocaleString("pt-BR")} registros demonstrativos · Dados não representam ocorrências policiais reais
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              aria-label="Buscar ID, RA, natureza ou localização" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar ID, RA, natureza ou localização…"
              style={{ ...selectStyle, minWidth: 200 }}
            />
            <select aria-label="Filtrar por natureza" style={selectStyle} value={filterNature} onChange={(e) => { setFilterNature(e.target.value); setPage(1); }}>
              <option value="">Todas as naturezas</option>
              {NATURES.map((n) => <option key={n} value={n} style={{ background: "var(--theme-111d2e)" }}>{n}</option>)}
            </select>
            <select aria-label="Filtrar por Região Administrativa" style={selectStyle} value={filterRA} onChange={(e) => { setFilterRA(e.target.value); setPage(1); }}>
              <option value="">Todas as regiões</option>
              {RA_CODES.map((c) => <option key={c} value={c} style={{ background: "var(--theme-111d2e)" }}>{RA_LIST.find(ra => ra.codigo === c)?.nomeDisplay} ({c}){c === "RA-S" ? " · área demonstrativa" : ""}</option>)}
            </select>
            <button type="button" onClick={clearFilters} style={selectStyle}>Limpar filtros</button>
            {canWrite(operations.role) && <Link href="/ocorrencias/nova">Nova ocorrência</Link>}
            <label><input type="checkbox" checked={showInactive} onChange={event => { setShowInactive(event.target.checked); setPage(1); }} /> Incluir inativas</label>
          </div>
        </div>

        {/* Table */}
        {(Object.keys(operations.records).length > 0 || Object.keys(operations.inactive).length > 0) && <p role="status">Cenário local em memória: alterações desta listagem não modificam os indicadores da base fictícia do Dashboard e Mapa. Recarregar restaura a base.</p>}
        <div style={{ background: "var(--theme-0d1a2d)", border: "1px solid var(--theme-1e3a5f)", borderRadius: 10, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "var(--theme-0a1525)", position: "sticky", top: 0 }}>
                <tr>
                  {([["id", "ID"], ["data", "Data"], ["horario", "Horário"], ["natureza", "Natureza"], ["raName", "Região Administrativa"], ["local", "Local"]] as const).map(([column, label]) => (
                    <th key={column} scope="col" style={colHead} aria-sort={sort?.column === column ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                      <button type="button" onClick={() => changeSort(column)} aria-label={`Ordenar por ${label} em ordem ${sort?.column === column && sort.direction === "asc" ? "decrescente" : "crescente"}`} style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", letterSpacing: "inherit", textTransform: "inherit", cursor: "pointer" }}>
                        {label} <span aria-hidden="true">{sort?.column === column ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
                      </button>
                    </th>
                  ))}
                  <th scope="col" style={colHead}>Estado e ações</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((o, i) => (
                  <tr
                    key={o.id}
                    style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
                  >
                    <td style={{ ...cell, color: "var(--theme-60a5fa)", fontFamily: "monospace", fontSize: 11 }}><button type="button" onClick={() => setSelected(o)} aria-label={`Ver detalhes de ${o.id}`} style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>{o.id}</button></td>
                    <td style={cell}>{o.data}</td>
                    <td style={cell}>{o.horario}</td>
                    <td style={{ ...cell, color: "var(--theme-f1f5f9)", fontWeight: 500 }}>{o.natureza}</td>
                    <td style={cell}>{o.raName}</td>
                    <td style={{ ...cell, color: "var(--color-text-muted)", fontSize: 11 }}>{o.local}</td>
                    <td style={cell}>{operations.inactive[o.id] ? <span title={operations.inactive[o.id]}>Inativa · {operations.inactive[o.id]}</span> : <><span>Ativa </span>{operations.correctionsEnabled && canWrite(operations.role) && <Button variant="ghost" onClick={() => setEditing(o)} aria-label={`Editar ${o.id}`}>Editar</Button>}{operations.correctionsEnabled && canInactivate(operations.role) && <Button variant="ghost" onClick={() => { setReason(""); setDeactivating(o); }} aria-label={`Inativar ${o.id}`}>Inativar</Button>}</>}</td>
                  </tr>
                ))}
                {pageData.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...cell, textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>
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
            flexWrap: "wrap",
            gap: 8,
            padding: "10px 16px",
            borderTop: "1px solid var(--theme-1e3a5f)",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              Página {currentPage} de {totalPages} · {total.toLocaleString("pt-BR")} registros
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <PagBtn onClick={() => setPage(1)} disabled={currentPage === 1}>«</PagBtn>
              <PagBtn onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>‹</PagBtn>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                const n = start + i;
                return (
                  <PagBtn key={n} onClick={() => setPage(n)} active={n === currentPage}>{n}</PagBtn>
                );
              })}
              <PagBtn onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>›</PagBtn>
              <PagBtn onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}>»</PagBtn>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10, color: "var(--color-text-muted)", textAlign: "center", fontStyle: "italic" }}>
          Dados demonstrativos — não representam ocorrências policiais reais
        </div>
      </div>
      {selected && <OccurrenceDetailsDialog occurrence={selected} onClose={() => setSelected(null)} />}
      {editing && operations.correctionsEnabled && canWrite(operations.role) && <Dialog title="Editar ocorrência demonstrativa" onClose={() => setEditing(null)} style={{ width: "min(850px, calc(100vw - 32px))" }}><h2>Editar ocorrência demonstrativa</h2><OccurrenceForm initial={editing} onDone={() => setEditing(null)} /></Dialog>}
      {deactivating && operations.correctionsEnabled && canInactivate(operations.role) && <Dialog title="Inativar ocorrência demonstrativa?" onClose={() => setDeactivating(null)}><h2>Inativar ocorrência demonstrativa?</h2><p>{deactivating.id} deixará a listagem ativa somente nesta simulação em memória.</p><label htmlFor="inactive-reason">Motivo obrigatório</label><textarea id="inactive-reason" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /><div className="occurrence-actions"><Button disabled={!reason.trim()} onClick={() => { if (operations.inactivate(deactivating.id, reason)) { notify("Inativação simulada em memória. Nenhum dado foi gravado no servidor."); setPage(1); setDeactivating(null); } }}>Confirmar inativação demonstrativa</Button><Button variant="outline" onClick={() => setDeactivating(null)}>Cancelar</Button></div></Dialog>}
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      aria-label={children === "«" ? "Primeira página" : children === "‹" ? "Página anterior" : children === "›" ? "Próxima página" : children === "»" ? "Última página" : `Página ${children}`}
      style={{
        width: 28, height: 28,
        border: active ? "none" : "1px solid var(--theme-1e3a5f)",
        borderRadius: 5,
        background: active ? "#2563eb" : disabled ? "transparent" : "transparent",
        color: active ? "#fff" : disabled ? "var(--theme-1e3a5f)" : "var(--theme-64748b)",
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
