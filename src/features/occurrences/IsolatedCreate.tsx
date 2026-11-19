"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Button from "@/components/ui/button"
import styles from "./SimulationWorkspace.module.css"
import type { IsolatedOccurrence } from "@/lib/db/isolated-occurrence-read"
import { readCatalog } from "@/features/occurrences/client"
import { natureCatalogDataSchema, regionCatalogDataSchema } from "@/contracts/persistent-catalogs"

const manualOptions = ["A", "B"].map((label, index) => ({
  id: "31000000-0000-4000-8000-00000000000" + (index + 1), descricao: "Natureza " + label,
}))

export default function IsolatedCreate({ initial, action, onSaved, persistent = false }: {
  initial?: IsolatedOccurrence; action?: "edit" | "inactivate"; onSaved?: () => void; persistent?: boolean
} = {}) {
  const command = useRef<{ body: string; key: string } | null>(null)
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState(false)
  const [operation, setOperation] = useState<"create" | "edit" | "inactivate">(action ?? "create")
  const [catalogs, setCatalogs] = useState<{ regions: { id: string; nome: string }[]; natures: { id: string; descricao: string }[] }>()
  const [catalogError, setCatalogError] = useState(false)
  useEffect(() => {
    if (!persistent) return
    const controller = new AbortController()
    Promise.all([readCatalog("regioes", controller.signal), readCatalog("naturezas", controller.signal)])
      .then(([regions, natures]) => {
        if (!controller.signal.aborted) setCatalogs({ regions: regionCatalogDataSchema.parse(regions).items,
          natures: natureCatalogDataSchema.parse(natures).items.filter(nature => manualOptions.some(option => option.id === nature.id)) })
      }).catch(() => { if (!controller.signal.aborted) setCatalogError(true) })
    return () => controller.abort()
  }, [persistent])
  const catalogPending = persistent && !catalogs && operation !== "inactivate"
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (running.current || catalogPending) return
    const form = new FormData(event.currentTarget)
    const hour = String(form.get("horario"))
    const fields = {
      data: form.get("data"), horario: hour.length === 5 ? hour + ":00" : hour,
      raId: form.get("ra"), local: form.get("local"), endereco: form.get("endereco"), bairroOuSetor: form.get("bairro"),
      coordenadas: { latitude: Number(form.get("latitude")), longitude: Number(form.get("longitude")) },
      naturezas: form.getAll("naturezas").flatMap(value => {
        const links = initial?.naturezas.filter(link => link.naturezaId === value)
        return links?.length ? links : [{ naturezaId: String(value), crimeTentado: null }]
      }),
    }
    const version = form.get("versao")
    const reason = form.get("motivo")
    const body = JSON.stringify(operation === "create" ? fields : operation === "edit"
      ? { versaoEsperada: version, justificativa: reason, alteracoes: fields }
      : { versaoEsperada: version, motivo: reason })
    if (command.current?.body !== body) command.current = { body, key: crypto.randomUUID() }
    running.current = true
    setBusy(true)
    setMessage("")
    try {
      const base = "/api/v1/ocorrencias"
      const path = operation === "create" ? base : base + "/" + encodeURIComponent(String(form.get("id"))) + (operation === "inactivate" ? "/inativacao" : "")
      const response = await fetch(path, {
        method: operation === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...((persistent || operation === "create") && { "Idempotency-Key": command.current.key }) }, body,
      })
      const result = await response.json()
      const persisted = response.status === (operation === "create" ? 201 : 200)
        && result.persisted === true && result.scope === (persistent ? "homologacao-persistente-sintetica" : "sandbox-synthetic-only")
      setError(!persisted)
      if (persisted) onSaved?.()
      setMessage(persisted ? `Registro sintético gravado no cluster isolado. Identificador: ${result.data.id}. Versão: ${result.data.versao}.`
        : response.status === 409 ? "A versão mudou. Confira a versão atual antes de repetir."
          : response.status === 422 ? "Revise os campos, a localização e a elegibilidade do registro sintético."
            : "Operação recusada ou indisponível. Confira a sessão e tente novamente.")
    } catch {
      setError(true)
      setMessage(operation === "create" ? "A confirmação falhou. Repita com os mesmos dados para reutilizar a chave do cadastro."
        : "A confirmação falhou. Confira a versão do registro antes de repetir.")
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return <form className={styles.form} onSubmit={submit}>
    <p role="note">Escrita persistente {persistent ? "na homologação local" : "no cluster descartável"}. Use somente dados sintéticos.</p>
    {!action && <label>Operação<select disabled={busy} value={operation} onChange={event => {
      setOperation(event.target.value as typeof operation); setMessage("")
    }}><option value="create">Cadastrar</option><option value="edit">Editar registro elegível</option><option value="inactivate">Inativar registro elegível</option></select></label>}
    {operation !== "create" && <fieldset disabled={busy} className={styles.grid}>
      <legend>Controle de versão</legend>
      <label>UUID da ocorrência<input name="id" defaultValue={initial?.id} readOnly={Boolean(initial)} pattern="[0-9a-fA-F\-]{36}" required /></label>
      <label>Versão esperada<input name="versao" defaultValue={initial?.versao} readOnly={Boolean(initial)} pattern="[1-9][0-9]*" required /></label>
      <label>Justificativa<textarea name="motivo" maxLength={500} required /></label>
      {operation === "inactivate" && <label><input type="checkbox" required /> Confirmo a inativação lógica</label>}
    </fieldset>}
    {operation !== "inactivate" && <fieldset disabled={busy} className={styles.grid}>
      <legend>Dados da ocorrência sintética</legend>
      <label>Data<input name="data" defaultValue={initial?.data ?? undefined} type="date" required /></label>
      <label>Horário<input name="horario" defaultValue={initial?.horario ?? undefined} type="time" step="1" required /></label>
      <label>Local do fato<input name="local" defaultValue={initial?.local ?? undefined} required minLength={5} maxLength={240} /></label>
      <label>Endereço<input name="endereco" defaultValue={initial?.endereco ?? ""} required maxLength={240} /></label>
      <label>Bairro ou setor<input name="bairro" defaultValue={initial?.bairro ?? ""} required maxLength={100} /></label>
      <label>Latitude<input name="latitude" defaultValue={initial?.latitude ?? undefined} type="number" step="any" min="-90" max="90" required /></label>
      <label>Longitude<input name="longitude" defaultValue={initial?.longitude ?? undefined} type="number" step="any" min="-180" max="180" required /></label>
      <label>Região Administrativa<select key={catalogs ? "loaded" : "initial"} name="ra" defaultValue={initial?.ra ?? undefined} required>
        <option value="">Selecione a região de ensaio</option>
        {persistent ? catalogs?.regions.map(region => <option key={region.id} value={region.id}>{region.nome}</option>)
          : <option value="11000000-0000-4000-8000-000000000001">Região sintética de ensaio</option>}
      </select></label>
      <fieldset><legend>Naturezas sintéticas</legend>
        {(persistent ? catalogs?.natures ?? [] : manualOptions).map(({ id, descricao }) => {
          return <label key={id}><input type="checkbox" name="naturezas" value={id}
            defaultChecked={initial?.naturezas.some(link => link.naturezaId === id)} /> {descricao}</label>
        })}
      </fieldset>
    </fieldset>}
    {catalogPending && <p role={catalogError ? "alert" : "status"}>{catalogError ? "Catálogo indisponível." : "Carregando catálogos…"}</p>}
    <Button type="submit" disabled={busy || catalogPending}>{busy ? "Gravando…" : operation === "inactivate" ? "Inativar ocorrência sintética" : "Gravar ocorrência sintética"}</Button>
    <p role={error ? "alert" : "status"}>{message}</p>
  </form>
}
