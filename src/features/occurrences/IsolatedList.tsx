"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Header from "@/components/Header"
import Button from "@/components/ui/button"
import Dialog from "@/components/ui/dialog"
import IsolatedCreate from "./IsolatedCreate"
import type { IsolatedOccurrence } from "@/lib/db/isolated-occurrence-read"
import styles from "@/features/Occurrences.module.css"

export default function IsolatedList({ rows, write, unavailable = false }: {
  rows: IsolatedOccurrence[]; write: boolean; unavailable?: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string>()
  const [action, setAction] = useState<"edit" | "inactivate">()
  const [notice, setNotice] = useState("")
  const record = rows.find(row => row.id === selected)
  const open = (id: string, next?: typeof action) => { setSelected(id); setAction(next) }
  const close = () => { setSelected(undefined); setAction(undefined) }
  return <div className={styles.screen}>
    <Header title="Ocorrências" subtitle="Consulta persistente isolada" />
    <div className={styles.content}>
      <div className={styles.heading}><h1>Ocorrências sintéticas</h1>
        {write && <Button asChild><Link href="/ocorrencias/nova">Cadastrar ocorrência sintética</Link></Button>}
      </div>
      <p role="status">{notice}</p>
      {unavailable ? <div role="alert">Consulta isolada indisponível. <Button onClick={() => router.refresh()}>Tentar novamente</Button></div>
        : rows.length === 0 ? <p>Nenhuma ocorrência sintética encontrada.</p>
          : <div style={{ overflowX: "auto" }}><table>
            <thead><tr><th>Ocorrência</th><th>Data</th><th>Local</th><th>Estado</th><th>Ações</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
              <td><Button variant="outline" onClick={() => open(row.id)}>{row.id}</Button></td>
              <td>{row.data ?? "Ausente"}</td><td>{row.local ?? "Ausente"}</td><td>{row.fonte ? "PCDF consolidada" : row.ativo ? "Ativa" : "Inativa"}</td>
              <td>{write && row.elegivel && <Button onClick={() => open(row.id, "edit")}>Editar</Button>}</td>
            </tr>)}</tbody>
          </table></div>}
    </div>
    {record && <Dialog title="Detalhes da ocorrência sintética" onClose={close}>
      <h2>Detalhes da ocorrência sintética</h2>
      <p>{record.local ?? "Local ausente"} · versão {record.versao}</p>
      {record.fonte && <p>Importação PCDF sintética · {record.naturezas.length} associações de natureza</p>}
      <p>{record.endereco ?? "Endereço não informado"} · {record.bairro ?? "Bairro ou setor não informado"}</p>
      {write && record.elegivel && (action
        ? <IsolatedCreate key={record.id + record.versao + action} initial={record} action={action} onSaved={() => {
            setNotice(action === "edit" ? "Ocorrência atualizada." : "Ocorrência inativada.")
            close(); router.refresh()
          }} />
        : <><Button onClick={() => setAction("edit")}>Editar ocorrência</Button>
          <Button variant="outline" onClick={() => setAction("inactivate")}>Inativar ocorrência</Button></>)}
    </Dialog>}
  </div>
}
