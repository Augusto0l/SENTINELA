"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import proposal from "../../../docs/catalogos/sentinela-classificacao-v2.json" with { type: "json" }
import { classificacaoPath, type ClassificacaoSituacao } from "@/contracts/classificacao"
import styles from "./ClassificacaoPanel.module.css"

const JANUARY_LOT = "84908630-bd04-4a03-923d-616649c8de74"
const categoryName = new Map(proposal.categorias.map(item => [item.codigoInterno, item.nome]))
const ruleKey = (rule: (typeof proposal.regras)[number]) => `${rule.id}:${rule.crimeTentado}`
const statusLabel: Record<string, string> = {
  pendente: "Pendentes", mapeada: "Classificadas", conflitante: "Conflitantes", sem_correspondencia: "Sem correspondência",
}

async function call(body?: object) {
  const response = await fetch(classificacaoPath, body ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Operação não concluída.")
  return payload.data
}

export default function ClassificacaoPanel() {
  const [status, setStatus] = useState<ClassificacaoSituacao>()
  const [message, setMessage] = useState("")
  const [result, setResult] = useState("")
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(() => new Set(proposal.regras.map(ruleKey)))
  const nextVersion = useMemo(() => `pcdf-classificacao-v2.${status?.versoes.length ?? 0}`, [status])

  const load = useCallback(() => {
    call().then(data => { setStatus(data); setMessage("") }).catch(error => {
      setStatus(undefined)
      setMessage((error as Error).message)
    })
  }, [])
  useEffect(load, [load])

  async function submit(event: FormEvent<HTMLFormElement>, build: (form: FormData) => object) {
    event.preventDefault()
    if (busy || !status) return
    setBusy(true)
    setResult("")
    try {
      const data = await call(build(new FormData(event.currentTarget)))
      setResult(JSON.stringify(data))
      load()
    } catch (error) {
      setResult((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim()
  return <section className={styles.panel} aria-labelledby="classificacao-heading" aria-busy={busy}>
    <h2 id="classificacao-heading">Classificação PCDF</h2>
    <p>As 41 naturezas originais são preservadas. Uma regra só classifica depois de homologada com responsável, evidência
      e vigência, e somente na versão ativa. Naturezas sem regra ou ambíguas ficam pendentes de revisão.</p>
    {message && <p role="alert" className={styles.error}>{message}</p>}
    {status && <dl className={styles.facts}>
      <div><dt>Versão ativa</dt><dd>{status.versaoAtiva ?? "Nenhuma"}</dd></div>
      <div><dt>Proposta revisada</dt><dd>{status.proposta.categorias} categorias · {status.proposta.regras} regras</dd></div>
      <div><dt>Pendências de classificação abertas</dt><dd>{status.pendenciasClassificacaoAbertas.toLocaleString("pt-BR")}</dd></div>
      {Object.entries(status.associacoes ?? {}).map(([key, count]) =>
        <div key={key}><dt>Associações {statusLabel[key]?.toLowerCase() ?? key}</dt><dd>{count.toLocaleString("pt-BR")}</dd></div>)}
    </dl>}
    {status && status.versoes.length > 0 && <table className={styles.table}>
      <caption>Versões homologadas</caption>
      <thead><tr><th scope="col">Versão</th><th scope="col">Vigência</th><th scope="col">Responsável</th><th scope="col">Regras</th></tr></thead>
      <tbody>{status.versoes.map(item => <tr key={item.versao}>
        <th scope="row">{item.versao}</th><td>{item.vigenciaInicio}{item.vigenciaFim ? ` a ${item.vigenciaFim}` : " em diante"}</td>
        <td>{item.responsavel}</td><td>{item.homologadas} homologadas · {item.naoClassificaveis} não classificáveis</td>
      </tr>)}</tbody>
    </table>}

    {status && <>
    <form className={styles.form} onSubmit={event => submit(event, form => ({ acao: "homologar", versao: text(form, "versao"),
      regras: [...selected], evidencia: text(form, "evidencia"), vigenciaInicio: text(form, "inicio"),
      ...(text(form, "fim") ? { vigenciaFim: text(form, "fim") } : {}) }))}>
      <h3>Homologar regras da proposta revisada</h3>
      <div className={styles.fields}>
        <label htmlFor="classificacao-versao">Versão</label>
        <input id="classificacao-versao" name="versao" required pattern="pcdf-classificacao-v2\.[0-9]{1,3}" defaultValue={nextVersion} key={nextVersion} />
        <label htmlFor="classificacao-inicio">Vigência a partir de</label>
        <input id="classificacao-inicio" name="inicio" type="date" required />
        <label htmlFor="classificacao-fim">Vigência até (opcional)</label>
        <input id="classificacao-fim" name="fim" type="date" />
        <label htmlFor="classificacao-evidencia">Evidência da homologação</label>
        <textarea id="classificacao-evidencia" name="evidencia" required minLength={10} maxLength={2000} rows={3} />
      </div>
      <div className={styles.scroll} role="region" aria-label="Regras da proposta" tabIndex={0}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Incluir</th><th scope="col">Regra</th><th scope="col">Natureza original</th>
            <th scope="col">Tentativa</th><th scope="col">Categoria proposta</th><th scope="col">Nível</th></tr></thead>
          <tbody>{proposal.regras.map(rule => {
            const key = ruleKey(rule)
            return <tr key={key}>
              <td><input type="checkbox" aria-label={`Incluir ${rule.id} ${rule.naturezaOriginal}`} checked={selected.has(key)}
                onChange={event => setSelected(current => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(key); else next.delete(key)
                  return next
                })} /></td>
              <th scope="row">{rule.id}</th><td>{rule.naturezaOriginal}</td><td>{rule.crimeTentado ? "Sim" : "Não"}</td>
              <td>{rule.categoriaProposta ? categoryName.get(rule.categoriaProposta) : "Conflitante (sem categoria)"}</td><td>{rule.nivel}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      <button type="submit" disabled={busy || !selected.size}>Homologar {selected.size} regras</button>
    </form>

    <form className={styles.form} onSubmit={event => submit(event, form => ({ acao: "ativar", versao: text(form, "versao") }))}>
      <h3>Ativar versão homologada</h3>
      <label htmlFor="classificacao-ativar">Versão</label>
      <select id="classificacao-ativar" name="versao" required>
        {status?.versoes.map(item => <option key={item.versao} value={item.versao}>{item.versao}</option>)}
      </select>
      <button type="submit" disabled={busy || !status?.versoes.length}>Ativar</button>
    </form>

    <form className={styles.form} onSubmit={event => submit(event, form => ({ acao: "aplicar", lote: text(form, "lote"),
      justificativa: text(form, "justificativa") }))}>
      <h3>Aplicar a versão ativa a um lote importado</h3>
      <label htmlFor="classificacao-lote">Lote</label>
      <input id="classificacao-lote" name="lote" required defaultValue={JANUARY_LOT} />
      <label htmlFor="classificacao-justificativa">Justificativa</label>
      <input id="classificacao-justificativa" name="justificativa" required minLength={10} maxLength={500} />
      <button type="submit" disabled={busy || !status?.versaoAtiva}>Aplicar</button>
    </form>

    <form className={styles.form} onSubmit={event => submit(event, form => ({ acao: "reverter", lote: text(form, "lote"),
      versao: text(form, "versao"), justificativa: text(form, "justificativa") }))}>
      <h3>Reverter classificação de um lote</h3>
      <label htmlFor="classificacao-reverter-lote">Lote</label>
      <input id="classificacao-reverter-lote" name="lote" required defaultValue={JANUARY_LOT} />
      <label htmlFor="classificacao-reverter-versao">Versão aplicada</label>
      <select id="classificacao-reverter-versao" name="versao" required>
        {status?.versoes.map(item => <option key={item.versao} value={item.versao}>{item.versao}</option>)}
      </select>
      <label htmlFor="classificacao-reverter-justificativa">Justificativa</label>
      <input id="classificacao-reverter-justificativa" name="justificativa" required minLength={10} maxLength={500} />
      <button type="submit" disabled={busy || !status?.versoes.length}>Reverter</button>
    </form>
    </>}
    {result && <p role="status" className={styles.result}>{result}</p>}
  </section>
}
