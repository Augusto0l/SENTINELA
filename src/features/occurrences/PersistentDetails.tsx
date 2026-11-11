"use client"
import { useCallback, useState } from "react"
import Dialog from "@/components/ui/dialog"
import Button from "@/components/ui/button"
import { readDetail } from "@/features/occurrences/client"
import useRead from "@/features/occurrences/use-read"
import ReadError from "@/features/occurrences/ReadError"
import styles from "@/features/Occurrences.module.css"

export default function PersistentDetails({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const [attempt, setAttempt] = useState(0)
  const load = useCallback(
    (signal: AbortSignal) => readDetail(id, signal),
    [id],
  )
  const state = useRead(id + ":" + attempt, load)
  const o = state.data
  const fields = o
    ? [
        ["UUID", o.id],
        [
          "Identificação",
          [o.anoRegistro, o.unidadeRegistro, o.numeroRegistro]
            .filter(Boolean)
            .join(" / ") || null,
        ],
        ["Data", o.data],
        ["Horário", o.horario],
        ["Região Administrativa", o.ra?.nome],
        ["Local", o.local],
        ["Latitude", o.latitude],
        ["Longitude", o.longitude],
        ["Situação de localização", o.localizacaoStatus],
        ["Consolidação", o.consolidacaoStatus],
        ["Estado", o.ativo ? "Ativa" : "Inativa"],
      ]
    : []
  return (
    <Dialog
      title="Detalhes da ocorrência"
      onClose={onClose}
      style={{ width: "min(650px, calc(100vw - 32px))" }}
    >
      <h2>Detalhes da ocorrência</h2>
      <p>Leitura persistente · dados sintéticos de desenvolvimento.</p>
      {state.loading && <p role="status">Carregando detalhes…</p>}
      {state.error && (
        <ReadError error={state.error} retry={() => setAttempt((v) => v + 1)} />
      )}
      {o && (
        <>
          <dl className={styles.fields}>
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? "Não informado"}</dd>
              </div>
            ))}
          </dl>
          <h3>Naturezas associadas</h3>
          {o.naturezas.length ? (
            <ul>
              {o.naturezas.map((a) => (
                <li key={a.id}>
                  {a.natureza?.descricao ?? "Natureza indisponível"} ·{" "}
                  {a.categoria?.nome ?? "Categoria não disponível"}
                  {a.crimeTentado ? " · Tentado" : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma natureza disponível.</p>
          )}
        </>
      )}
      <Button variant="outline" onClick={onClose}>
        Fechar detalhes
      </Button>
    </Dialog>
  )
}
