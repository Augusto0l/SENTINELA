import "../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const { classificacaoAplicacao, classificacaoComando, classificacaoSituacao } = await import("../src/contracts/classificacao.ts")
const { directReceipt, historicalReceipt } = await import("../src/contracts/pcdf-direct.ts")
const { localOccurrencesQuery, localOccurrenceSummary } = await import("../src/contracts/local-occurrences.ts")
const { analyticsSql } = await import("../src/lib/db/analytics-query.ts")
const migration = read("database/supabase/pendentes/0020_classificacao_pcdf_v2.sql")
const proposal = JSON.parse(read("docs/catalogos/sentinela-classificacao-v2.json"))

test("0020 hospedada: sem resíduos do clone, sem versão de ensaio e transacional", () => {
  for (const residue of ["55487", "55484", "sentinela_clone", "clone_db", "-ensaio", "session_user = 'postgres'"])
    assert(!migration.includes(residue), `resíduo do ensaio local: ${residue}`)
  assert.match(migration, /^-- 0020 .*PENDENTE/m)
  assert.match(migration, /\nBEGIN;\n/)
  assert.match(migration, /\nCOMMIT;\s*$/)
  assert.match(migration, /SET LOCAL lock_timeout = '5s';/)
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY|NO FORCE ROW LEVEL SECURITY|(?<!NO)BYPASSRLS/)
  assert.match(migration, /NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/)
  assert.match(migration, /INSERT INTO sentinela\.schema_migrations VALUES \('0020'/)
})

test("0020 hospedada: identidade da sessão Auth verificada, nunca do cliente", () => {
  const ator = migration.slice(migration.indexOf("CREATE FUNCTION sentinela_classificacao.ator()"),
    migration.indexOf("REVOKE ALL ON FUNCTION sentinela_classificacao.ator()"))
  assert.match(ator, /u\.id = sentinela_ambiente\.ator_operacional\(\)/)
  assert.match(ator, /u\.perfil = 'Administrador'/)
  assert.match(ator, /session_user = 'sentinela_local_admin'/)
  assert.match(ator, /sentinela_ambiente\.vinculado\(\)/)
  const verificado = migration.slice(migration.indexOf("CREATE FUNCTION sentinela_classificacao.verificado()"),
    migration.indexOf("REVOKE ALL ON FUNCTION sentinela_classificacao.verificado()"))
  assert.match(verificado, /current_user = 'sentinela_classificacao_owner'/)
  assert.match(verificado, /pg_current_xact_id\(\)::text/)
  for (const name of ["homologar", "ativar", "aplicar_lote", "reverter_lote"]) {
    const start = migration.indexOf(`CREATE FUNCTION sentinela_classificacao.${name}(`)
    const body = migration.slice(start, migration.indexOf("END $fn$;", start))
    assert.match(body, /v_ator uuid := sentinela_classificacao\.ator\(\)/, name)
    assert.match(body, /IF v_ator IS NULL THEN RAISE EXCEPTION '[^']+' USING ERRCODE = '42501'/, name)
    assert.match(body, /set_config\('sentinela\.classificacao_ator', v_ator::text, true\)/, name)
    assert.doesNotMatch(body.split("\n")[0], /p_aprovador|p_usuario|p_responsavel/, `${name} não aceita identificador do cliente`)
  }
  assert.match(migration, /GRANT EXECUTE ON FUNCTION sentinela_classificacao\.homologar\([^;]+TO sentinela_local_admin;/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION sentinela_classificacao\.situacao\(\) TO sentinela_local_admin, sentinela_local_operator;/)
  assert.doesNotMatch(migration, /TO [^;]*sentinela_local_analyst/)
})

test("0020 hospedada: proposta pendente instalada; homologação e ativação só pelas funções auditadas", () => {
  assert.match(migration, /'sentinela-categorias-v2', 'pendente'/)
  assert.doesNotMatch(migration, /INSERT INTO sentinela_classificacao\.liberacao[^;]*'pcdf-classificacao-v2\./)
  assert.match(migration, /\(SELECT versao_ativa FROM sentinela_classificacao\.liberacao\) IS NOT NULL/)
  assert.match(migration, /relforcerowsecurity\) <> 19/)
  assert.match(migration, /relforcerowsecurity\) <> 3/)
  const aplicar = migration.slice(migration.indexOf("CREATE FUNCTION sentinela_classificacao.aplicar_lote("),
    migration.indexOf("CREATE FUNCTION sentinela_classificacao.reverter_lote("))
  assert.match(aplicar, /RETURN jsonb_build_object\('aplicada', false, 'motivo', 'sem_versao_ativa'\)/)
  assert.match(aplicar, /pg_advisory_xact_lock/)
  assert.match(aplicar, /a\.origem = 'importacao' AND a\.classificacao_status = 'pendente'/)
  assert.match(aplicar, /m\.status = 'homologado' AND c\.status = 'homologada' THEN 'mapeada'/)
  assert.match(aplicar, /x\.situacao IS DISTINCT FROM 'mapeada'/)
  assert.match(aplicar, /'natureza_sem_regra'/)
  assert.match(aplicar, /SET CONSTRAINTS ALL IMMEDIATE/)
  assert.equal(proposal.regras.length, 43)
  assert.equal(proposal.regras.filter(rule => rule.statusRegra !== "homologavel").length, 1)
})

test("contratos: comando discriminado, versão homologável e recibo com classificação opcional", () => {
  const regras = proposal.regras.map(rule => `${rule.id}:${rule.crimeTentado}`)
  assert.equal(new Set(regras).size, 43)
  assert(classificacaoComando.safeParse({ acao: "homologar", versao: "pcdf-classificacao-v2.0", regras,
    evidencia: "Ata de revisão semântica.", vigenciaInicio: "2026-12-01" }).success)
  for (const versao of ["pcdf-classificacao-v2-ensaio", "pcdf-classificacao-v2", "v2.0"])
    assert(!classificacaoComando.safeParse({ acao: "ativar", versao }).success, versao)
  assert(!classificacaoComando.safeParse({ acao: "homologar", versao: "pcdf-classificacao-v2.0", regras: ["PCDF-N-01"],
    evidencia: "Ata de revisão semântica.", vigenciaInicio: "2026-12-01" }).success)
  assert(!classificacaoComando.safeParse({ acao: "aplicar", lote: "nao-uuid", justificativa: "Aplicação de janeiro." }).success)
  assert(!classificacaoComando.safeParse({ acao: "homologar", versao: "pcdf-classificacao-v2.0", regras,
    evidencia: "Ata.", vigenciaInicio: "2026-12-01", aprovador: "00000000-0000-4000-8000-000000000000" }).success)
  assert(classificacaoAplicacao.safeParse({ aplicada: false, motivo: "sem_versao_ativa" }).success)
  assert(classificacaoAplicacao.safeParse({ aplicada: true, versao: "pcdf-classificacao-v2.0", mapeadas: 6378, conflitantes: 14,
    semCorrespondencia: 0, desconhecidas: 0, pendenciasResolvidas: 6378, pendenciasCriadas: 0 }).success)
  assert(classificacaoSituacao.safeParse({ versaoAtiva: null, proposta: { categorias: 23, regras: 43 }, versoes: [],
    associacoes: null, pendenciasClassificacaoAbertas: 0 }).success)
  assert.equal(directReceipt.shape.classificacao.isOptional(), true)
  assert.equal(historicalReceipt.shape.classificacao.isOptional(), true)
})

test("Ocorrências: filtro por categoria agrupada só nas consolidadas e resumo compatível antes da 0020", () => {
  assert(localOccurrencesQuery.safeParse({ view: "consolidadas", categoria: "Homicídio" }).success)
  assert(!localOccurrencesQuery.safeParse({ view: "importados", categoria: "Homicídio" }).success)
  assert(!localOccurrencesQuery.safeParse({ view: "consolidadas", categoria: " " }).success)
  const base = { canImport: true, recebidas: 1, consolidadas: 1, pendencias: 0, competencias: [], rasImportadas: [],
    naturezasImportadas: [], rasConsolidadas: [], naturezasConsolidadas: [] }
  assert(localOccurrenceSummary.safeParse(base).success)
  assert(localOccurrenceSummary.safeParse({ ...base, categoriasConsolidadas: ["Homicídio"] }).success)
  assert.match(migration, /AND \(\$1->>'categoria' IS NULL OR EXISTS\(SELECT FROM sentinela\.ocorrencia_naturezas a/)
  assert.match(migration, /'categoriasConsolidadas',coalesce/)
})

test("Dashboard e Mapa: categoria homologada tem precedência e o rótulo PCDF é reserva", () => {
  const { text } = analyticsSql({ scope: "pcdf" }, "integrated")
  assert.match(text, /coalesce\(c\.nome,nullif\(to_jsonb\(a\)->>'categoria_pcdf_original',''\)\)/)
  assert.match(text, /c\.status='homologada'/)
  const legacy = analyticsSql({}, "legacy").text
  assert.doesNotMatch(legacy, /c\.status='homologada'/)
})

test("importação confirmada aplica a versão ativa na mesma transação, antes do COMMIT", () => {
  const source = read("src/lib/db/pcdf-direct.ts")
  const apply = source.indexOf("await aplicarNaImportacao(client, receipt.lot)")
  assert(apply > 0 && apply < source.indexOf('await client.query("COMMIT")', apply))
  const lib = read("src/lib/db/classificacao.ts")
  assert.match(lib, /to_regprocedure\('sentinela_classificacao\.aplicar_lote\(uuid,text\)'\)/)
  assert.match(lib, /proposal\.regras\.filter/)
  const route = read("src/app/api/v1/classificacao/route.ts")
  assert.match(route, /code === "55P03"/)
  assert.match(route, /readBoundedJson\(request, 16384\)/)
})

test("0021 compensatória: exige lotes revertidos, restaura funções vivas e preserva auditoria", () => {
  const reversal = read("database/supabase/pendentes/0021_reverte_0020.sql")
  assert.match(reversal, /^-- 0021 .*PENDENTE/m)
  assert.match(reversal, /Ha associacoes classificadas pela v2: reverta os lotes antes da 0021\./)
  for (const name of ["sentinela.bloquear_correcao_sem_backend()", "sentinela.bloquear_autoria_manual_sem_auth()",
    "sentinela_ocorrencias_local.detalhe(", "sentinela_ocorrencias_local.lista(", "sentinela_ocorrencias_local.resumo()"])
    assert(reversal.includes(`CREATE OR REPLACE FUNCTION ${name}`), name)
  assert.doesNotMatch(reversal, /sentinela_classificacao\.(verificado|ator)\(\)/)
  assert.doesNotMatch(reversal, /DELETE FROM|TRUNCATE|DISABLE ROW LEVEL SECURITY|DROP TABLE sentinela\./)
  assert.match(reversal, /EXECUTE format\('SET LOCAL ROLE %I', r\.grantor::regrole\)/)
  assert.match(reversal, /DROP SCHEMA sentinela_classificacao CASCADE;/)
  assert.match(reversal, /DROP ROLE sentinela_classificacao_owner;/)
})
