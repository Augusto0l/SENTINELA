"use client";

import { useState } from "react";
import type { PcdfV2Record } from "@/data/pcdfV2";
import { pcdfInformationalFields } from "@/data/pcdfNatureCatalog";
import Button from "@/components/ui/button";
import { Fields, ImportDialog, Pager, formatCount, pageSize } from "./ImportUi";
import styles from "./ImportWorkflow.module.css";

type PreviewRow = Omit<PcdfV2Record, "origin"> & { origin?: Partial<Record<string, string>> };
type Row = PreviewRow & { ordinal: number };

export const pcdfFieldGroups = [
  ["Identificação policial", ["ano_registro", "unidade_registro", "numero_registro", "ocorrencia_chave"]],
  ["Datas e horários", ["ano_fato", "data_inicio_fato_original", "data", "horario"]],
  ["Natureza criminal", ["natureza_original", "crime_tentado"]],
  ["Endereço e RA", ["cidade_endereco_original", "ra_original", "area_endereco_original", "quadra_endereco_original", "ra_codigo", "local"]],
  ["Coordenadas", ["latitude_geo_original", "longitude_geo_original", "latitude_utm_original", "longitude_utm_original", "latitude", "longitude", "coordenada_status"]],
  ["Informações complementares", ["flagrante", "unidade_apuracao", "natureza_padronizada_pcdf"]],
  ["Rastreabilidade técnica", ["fonte", "linha_origem_id", "linha_xml", "aba_origem", "versao_tratamento"]],
] as const;

export const fieldCategory = new Map<string, string>(pcdfFieldGroups.flatMap(([label, fields]) => fields.map(field => [field, label])));
const issueLabel = (rule: string) => rule.replace(/_/g, " ");

export function summarizePcdfWarnings(headers: string[], records: { cells: string[]; issues: [string, string][] }[]) {
  const counts = new Map<string, { fields: Map<string, number>; rows: Set<number> }>();
  function add(group: string, message: string, index: number) {
    const entry = counts.get(group) ?? { fields: new Map<string, number>(), rows: new Set<number>() };
    entry.fields.set(message, (entry.fields.get(message) ?? 0) + 1);
    entry.rows.add(index);
    counts.set(group, entry);
  }
  records.forEach(({ cells, issues }, index) => {
    issues.forEach(([field, rule]) => add(fieldCategory.get(field) ?? "Outros avisos", issueLabel(rule), index));
    cells.forEach((value, column) => {
      if (value.trim() === "" && !pcdfInformationalFields.has(headers[column])) add("Campos vazios", headers[column], index);
    });
  });
  return counts;
}

export function PcdfRecords({ headers, rows, label = "Prévia PCDF" }: { headers: string[]; rows: Row[]; label?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Row>();
  const positions = new Map(headers.map((field, i) => [field, i]));
  const value = (row: Row, field: string) => row.cells[positions.get(field) ?? -1] ?? row.origin?.[field] ?? "";
  return <>
    <div className={styles.tableActions}>
      <Button variant="outline" size="sm" aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}>{expanded ? "Voltar à prévia resumida" : "Ver todos os campos"}</Button>
    </div>
    {expanded ? <div className={styles.tableScroll} role="region" aria-label={label + " · todos os campos"} tabIndex={0}>
      <table className={styles.pcdfTable}>
        <caption>Valores originais do CSV · {headers.length} campos</caption>
        <thead><tr><th scope="col">Registro</th>{headers.map(field => <th scope="col" key={field}>{field}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.ordinal}>
          <th scope="row"><button type="button" className={styles.textButton} onClick={() => setSelected(row)}>{row.ordinal}</button></th>
          {row.cells.map((cell, i) => <td key={headers[i]}>{cell || <span className={styles.empty}>Vazio</span>}</td>)}
        </tr>)}</tbody>
      </table>
    </div> : <div className={styles.previewTable} role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead><tr>{["Registro", "Data", "Natureza", "RA e localização", "Validação", "Detalhes"].map(field =>
          <th scope="col" key={field}>{field}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
          const registration = ["ano_registro", "unidade_registro", "numero_registro"].map(field => value(row, field)).filter(Boolean);
          const location = ["ra_original", "local"].map(field => value(row, field)).filter(Boolean);
          return <tr key={row.ordinal}>
            <th scope="row" data-label="Registro"><strong>{row.ordinal}</strong>{registration.length > 0 && <small>{registration.join(" / ")}</small>}</th>
            <td data-label="Data">{value(row, "data") || value(row, "data_inicio_fato_original") || "—"}</td>
            <td data-label="Natureza">{value(row, "natureza_original") || "—"}</td>
            <td data-label="RA e localização">{location.length ? location.join(" · ") : "—"}</td>
            <td data-label="Validação"><span className={row.issues.length ? styles.warningText : styles.goodText}>
              {row.issues.length ? formatCount(row.issues.length) + " avisos" : "Sem avisos"}</span></td>
            <td data-label="Detalhes"><button type="button" className={styles.textButton} onClick={() => setSelected(row)}
              aria-label={"Detalhes do registro " + row.ordinal}>Ver registro</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    {selected && <ImportDialog title={"Registro " + selected.ordinal} onClose={() => setSelected(undefined)}>
      {selected.issues.length > 0 && <details className={styles.disclosure}><summary>Avisos deste registro ({selected.issues.length})</summary>
        <ul>{selected.issues.map(([field, rule], index) => <li key={index}>{field} · {issueLabel(rule)}</li>)}</ul>
      </details>}
      {pcdfFieldGroups.map(([group, fields]) => {
        const present = fields.filter(field => positions.has(field) || Object.prototype.hasOwnProperty.call(selected.origin ?? {}, field));
        return present.length > 0 && <section key={group} className={styles.recordGroup}>
          <h3>{group}</h3><Fields items={present.map(field => ({
            label: field === "natureza_padronizada_pcdf" ? "Categoria de origem PCDF" : field,
            value: value(selected, field),
          }))} />
        </section>;
      })}
    </ImportDialog>}
  </>;
}

export function PcdfPreviewRecords({ headers, records, indices }: {
  headers: string[]; records: PreviewRow[]; indices?: number[];
}) {
  const [page, setPage] = useState(1);
  const offset = (page - 1) * pageSize;
  const rows = indices
    ? indices.slice(offset, offset + pageSize).map(index => ({ ...records[index], ordinal: index + 1 }))
    : records.slice(offset, offset + pageSize).map((row, index) => ({ ...row, ordinal: offset + index + 1 }));
  return <>
    <PcdfRecords headers={headers} rows={rows} />
    <Pager page={page} total={indices?.length ?? records.length} onChange={setPage} />
  </>;
}
