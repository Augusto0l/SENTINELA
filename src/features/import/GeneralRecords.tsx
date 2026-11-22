"use client";

import { useState } from "react";
import type { ImportAnalysis, ImportTable } from "@/data/importTypes";
import { Fields, ImportDialog, Pager, pageSize } from "./ImportUi";
import styles from "./ImportWorkflow.module.css";

export default function GeneralRecords({ analysis, columns }: { analysis: ImportAnalysis; columns: ImportTable["headers"] }) {
  const [filter, setFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ImportAnalysis["rows"][number]>();
  const filtered = analysis.rows.filter(row => filter === "todos" || row.status === filter);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  return <>
    <div className={styles.tableActions}>
      <label>Filtrar registros<select aria-label="Filtrar registros" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
        <option value="todos">Todos</option><option value="valido">Válidos</option>
        <option value="pendente">Com pendências</option><option value="invalido">Inválidos</option>
      </select></label>
    </div>
    <div className={styles.previewTable} role="region" aria-label="Prévia do arquivo geral" tabIndex={0}>
      <table><thead><tr>{["Registro", "Data e hora", "Natureza", "RA e localização", "Validação", "Detalhes"].map(label =>
        <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.line}>
          <th scope="row" data-label="Registro">{row.line}</th>
          <td data-label="Data e hora">{[row.normalized.data, row.normalized.horario].filter(Boolean).join(" · ") || "—"}</td>
          <td data-label="Natureza">{row.normalized.naturezas.join("; ") || "—"}</td>
          <td data-label="RA e localização">{[row.normalized.raCode, row.normalized.local].filter(Boolean).join(" · ") || "—"}</td>
          <td data-label="Validação"><span className={row.status === "valido" ? styles.goodText : styles.warningText}>
            {row.status === "valido" ? "Válido" : row.status === "pendente" ? "Pendente" : "Inválido"}</span></td>
          <td data-label="Detalhes"><button className={styles.textButton} type="button" onClick={() => setSelected(row)}
            aria-label={"Detalhes do registro " + row.line}>Ver registro</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!rows.length && <p className={styles.emptyState}>Nenhum registro nesta situação.</p>}
    <Pager page={page} total={filtered.length} onChange={setPage} />
    {selected && <ImportDialog title={"Registro " + selected.line} onClose={() => setSelected(undefined)}>
      {selected.issues.length > 0 && <details className={styles.disclosure}><summary>Avisos deste registro</summary>
        <ul>{selected.issues.map((item, i) => <li key={i}>{item.column ? columns[item.column - 1] + " · " : ""}{item.message}</li>)}</ul>
      </details>}
      {selected.possibleDuplicateOf !== undefined && <p>Possível duplicata do registro {selected.possibleDuplicateOf}.</p>}
      <Fields items={selected.original.map((cell, i) => ({
        label: columns[i] || "Coluna " + (i + 1),
        value: cell.formula ? <>{cell.value === null ? "" : String(cell.value)}<small>Fórmula original <code>{cell.formula}</code></small></>
          : cell.value === null ? null : String(cell.value),
      }))} />
    </ImportDialog>}
  </>;
}
