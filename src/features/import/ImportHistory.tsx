"use client"

import { useState } from "react"
import Button from "@/components/ui/button"
import { generalDetail, generalHistory, generalImportPath } from "@/contracts/general-import"
import { usePcdfQuery } from "./pcdf-client"
import styles from "./ImportWorkflow.module.css"

function RunDetails({ run }: { run: string }) {
  const [page, setPage] = useState(1)
  const { current, reload } = usePcdfQuery(generalImportPath + "/" + run + "?pagina=" + page, generalDetail)
  const details = current?.data
  if (current?.error) return <p role="alert">{current.error} <Button variant="outline" onClick={reload}>Tentar novamente</Button></p>
  if (!details) return <p role="status">Carregando detalhes da execução…</p>
  return <>
    <div className={styles.tableScroll} role="region" aria-label="Detalhes do lote" tabIndex={0}>
      <table><caption>Originais e diagnósticos gravados</caption><thead><tr>
        <th scope="col">Linha</th><th scope="col">Situação</th><th scope="col">Valores originais</th><th scope="col">Diagnósticos</th>
      </tr></thead><tbody>{details.rows.map(row => <tr key={row.line}>
        <th scope="row">{row.line}</th><td>{row.status === "valido" ? "Válida" : row.status === "pendente" ? "Pendente" : "Inválida"}</td>
        <td><details><summary>Ver valores da linha {row.line}</summary><dl>{row.cells.map((cell, i) =>
          <div key={i}><dt>{i + 1}. {details.headers[i] || "Sem cabeçalho"}</dt>
            <dd>{String(cell.value ?? "") || "(vazio)"}{cell.formula && " · Fórmula original: " + cell.formula}</dd></div>)}</dl></details></td>
        <td><ul>{row.issues.map((issue, i) => <li key={i}>{issue.column ? "Coluna " + issue.column + " · " : ""}{issue.message}</li>)}
          {row.duplicateOf !== undefined && <li>Possível duplicata da linha {row.duplicateOf}.</li>}</ul></td>
      </tr>)}</tbody></table>
    </div>
    <nav className={styles.actions} aria-label="Paginação do histórico">
      <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
      <span>Página {page} · {details.total} linhas</span>
      <Button variant="outline" disabled={page * 25 >= details.total} onClick={() => setPage(page + 1)}>Próxima</Button>
    </nav>
  </>
}

export default function ImportHistory() {
  const { current, reload } = usePcdfQuery(generalImportPath, generalHistory)
  const [selected, setSelected] = useState<{ request: string; run: string }>()
  return <section className={styles.card}>
    <h2>Histórico de importações</h2>
    <Button variant="outline" onClick={reload}>Atualizar histórico</Button>
    {!current && <p role="status">Consultando o PostgreSQL…</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.data?.length === 0 && <p>Nenhuma tentativa registrada.</p>}
    {current?.data?.length === 100 && <p>Últimas 100 tentativas.</p>}
    {current?.data?.map(item => <article key={item.request} className={styles.historyItem}>
      <h3>{item.name}</h3>
      <p>{item.format.toUpperCase()} · {item.sheet} · {item.actor} · {new Date(item.created).toLocaleString("pt-BR")}</p>
      <p>{item.status === "recebida" ? "Recebida · gravação ainda sem confirmação" : item.status === "falhou"
        ? "Falhou · reenvie o mesmo arquivo e mapeamento para tentar novamente"
        : item.receipt?.replay ? "Reenvio · lote original preservado" : item.receipt?.summary.issues
          ? "Concluída com pendências" : "Concluída"}</p>
      {item.receipt && <>
        <p>{item.receipt.persisted} linhas persistidas · {item.receipt.summary.issues} diagnósticos</p>
        <p>Lote {item.receipt.lot}<br />Execução {item.receipt.run}</p>
        <Button variant="outline" aria-expanded={selected?.request === item.request}
          onClick={() => setSelected(selected?.request === item.request ? undefined : { request: item.request, run: item.receipt!.run })}>
          {selected?.request === item.request ? "Fechar detalhes" : "Abrir detalhes"}
        </Button>
        {selected?.request === item.request && <RunDetails key={selected.run} run={selected.run} />}
      </>}
    </article>)}
  </section>
}
