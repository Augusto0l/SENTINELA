import "server-only"
import type { Client } from "pg"
import proposal from "../../../docs/catalogos/sentinela-classificacao-v2.json" with { type: "json" }
import {
  classificacaoAplicacao, classificacaoComando, classificacaoSituacao, type ClassificacaoComando,
} from "@/contracts/classificacao"
import { attestHostedImportDatabase, getHostedImportPrincipal, hostedImportConnection } from "@/lib/db/hosted-import-db"
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"

export class ClassificacaoError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

const AUTO = "Aplicação automática da versão homologada ativa na importação PCDF confirmada."

/** Classification writes have their own gate; general operational writes stay closed. */
export function classificacaoWriteEnabled(env = process.env) {
  return Boolean(hostedOperationalMode(env) && env.SENTINELA_SUPABASE_CLASSIFICACAO_WRITE === "1")
}

/** Rules sent to the database come only from the reviewed canonical file; the client chooses rule ids. */
export function regrasHomologacao(ids: string[]) {
  const wanted = new Set(ids)
  const rules = proposal.regras.filter(rule => wanted.has(`${rule.id}:${rule.crimeTentado}`))
  if (rules.length !== wanted.size) throw new ClassificacaoError(422, "Regra fora da proposta revisada v2.")
  return rules.map(rule => ({
    regraId: rule.id, natureza: rule.naturezaOriginal, crimeTentado: rule.crimeTentado,
    categoria: rule.categoriaProposta, nivel: rule.nivel, justificativa: rule.justificativa,
    status: rule.statusRegra === "homologavel" ? "homologado" : "conflitante",
  }))
}

export const proposalSha256 = proposal.fontes.sha256Triplas

async function withAdministrador<T>(write: boolean, run: (client: Client) => Promise<T>) {
  const mode = hostedOperationalMode()
  if (!mode) throw new ClassificacaoError(503, "Classificação disponível somente no ambiente institucional.")
  const principal = await getHostedImportPrincipal()
  if (!principal) throw new ClassificacaoError(401, "Sessão necessária.")
  if (write && (principal.role !== "Administrador" || !classificacaoWriteEnabled()))
    throw new ClassificacaoError(403, "Operação de classificação não autorizada.")
  if (!write && principal.role === "Analista") throw new ClassificacaoError(403, "Consulta não autorizada para este perfil.")
  const connection = hostedImportConnection(principal, 120000, true)
  const { client } = connection
  client.on("error", () => {})
  try {
    if (!await attestHostedImportDatabase(connection, principal, !write, true))
      throw new ClassificacaoError(403, "Sessão institucional não autorizada.")
    await client.query(write ? "BEGIN READ WRITE" : "BEGIN READ ONLY")
    try {
      const result = await run(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    }
  } finally {
    await client.end().catch(() => {})
  }
}

export function lerSituacao() {
  return withAdministrador(false, async client => {
    const { rows: [row] } = await client.query("SELECT sentinela_classificacao.situacao() AS data")
    if (!row?.data) throw new ClassificacaoError(403, "Situação indisponível para esta sessão.")
    return classificacaoSituacao.parse(row.data)
  })
}

export function executarComando(input: ClassificacaoComando) {
  const command = classificacaoComando.parse(input)
  return withAdministrador(true, async client => {
    if (command.acao === "homologar") {
      const { rows: [row] } = await client.query("SELECT sentinela_classificacao.homologar($1,$2,$3,$4,$5,$6) AS data", [
        command.versao, JSON.stringify(regrasHomologacao(command.regras)), command.evidencia,
        command.vigenciaInicio, command.vigenciaFim ?? null, proposalSha256])
      return row.data
    }
    if (command.acao === "ativar") {
      const { rows: [row] } = await client.query("SELECT sentinela_classificacao.ativar($1) AS data", [command.versao])
      return row.data
    }
    if (command.acao === "aplicar") {
      const { rows: [row] } = await client.query("SELECT sentinela_classificacao.aplicar_lote($1,$2) AS data",
        [command.lote, command.justificativa])
      return classificacaoAplicacao.parse(row.data)
    }
    const { rows: [row] } = await client.query("SELECT sentinela_classificacao.reverter_lote($1,$2,$3) AS data",
      [command.lote, command.versao, command.justificativa])
    return row.data
  })
}

/**
 * Called inside the confirmed PCDF import transaction (same connection, same verified Administrador session).
 * Without the 0015 objects, without privilege or without an active version it changes nothing; any database
 * error rolls back the whole import, keeping the operation atomic and retryable.
 */
export async function aplicarNaImportacao(client: Client, lot: string) {
  const { rows: [check] } = await client.query(`SELECT coalesce(has_function_privilege(
    to_regprocedure('sentinela_classificacao.aplicar_lote(uuid,text)'),'EXECUTE'),false) AS available`)
  if (!check?.available) return undefined
  const { rows: [row] } = await client.query("SELECT sentinela_classificacao.aplicar_lote($1,$2) AS data", [lot, AUTO])
  return classificacaoAplicacao.parse(row.data)
}
