import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const json = path => JSON.parse(read(path))
const january = json("docs/catalogos/pcdf-matriz-conjunta-2021-01.json")
const full = json("docs/catalogos/pcdf-matriz-conjunta-2021-2026.json")
const proposal = json("docs/catalogos/sentinela-classificacao-v2.json")
const correspondences = json("docs/catalogos/pcdf-correspondencias-v1.json")
const rehearsal = json("docs/catalogos/ensaio-classificacao-v2.json")
const sql = name => read(`database/local/catalogo-criminal/sql/${name}`)
const rule = (nature, attempt = false) => proposal.regras.find(r => r.naturezaOriginal === nature && r.crimeTentado === attempt)
const category = code => proposal.categorias.find(item => item.codigoInterno === code)

test("matriz de janeiro/2021: 6.392 associações importadas sem par ambíguo", () => {
  assert.equal(january.totais.associacoesImportadas + january.totais.associacoesManuais, 6393)
  assert.equal(january.triplas.reduce((sum, row) => sum + row.associacoes, 0), 6392)
})

test("matriz de 68 competências: 369.660 associações, 41 naturezas, nenhum par ambíguo", () => {
  assert.deepEqual([full.totais.associacoes, full.totais.triplas, full.totais.naturezas, full.totais.categoriasPcdf, full.totais.paresAmbiguos],
    [369660, 43, 41, 19, 0])
  assert.equal(full.triplas.reduce((sum, row) => sum + row.associacoes, 0), 369660)
  const attempted = new Set(full.triplas.filter(row => row.crime_tentado).map(row => row.natureza_original))
  assert.deepEqual([...attempted].sort(), ["FEMINICIDIO", "HOMICIDIO"])
  const janTriples = new Set(january.triplas.map(row => `${row.natureza_original}|${row.categoria_pcdf}|${row.crime_tentado}`))
  assert.equal(full.triplas.filter(row => !janTriples.has(`${row.natureza_original}|${row.categoria_pcdf}|${row.crime_tentado}`)).length, 7)
})

test("proposta v2: 23 categorias pendentes, 43 regras, 41 naturezas rastreadas, nenhuma homologação", () => {
  assert.equal(proposal.status, "proposta-sem-homologacao")
  assert.equal(proposal.categorias.length, 23)
  assert.ok(proposal.categorias.every(item => item.status === "pendente"))
  assert.equal(proposal.regras.length, 43)
  assert.deepEqual([...new Set(proposal.regras.map(r => r.id))].sort(), correspondences.linhas.map(row => row.id).sort())
  assert.equal(Object.values(proposal.resumo).reduce((sum, level) => sum + level.associacoes, 0), 369660)
})

test("revisão semântica: associação não é tráfico, explosivo não é arma de fogo, porte genérico é ambíguo", () => {
  assert.equal(category(rule("ASSOCIACAO PARA O FIM DE TRAFICO DE SUBSTANCIA ENTORPECENTE").categoriaProposta).nome, "Associação para o tráfico de drogas")
  const explosive = proposal.regras.find(r => r.naturezaOriginal.startsWith("POSSUIR, DETIVER, FABRICAR OU EMPREGAR ARTEFATO EXPLOSIVO"))
  assert.equal(category(explosive.categoriaProposta).nome, "Artefato explosivo ou incendiário")
  assert.equal(rule("PORTE DE ARMA").nivel, "ambigua")
  assert.equal(rule("PORTE DE ARMA").categoriaProposta, null)
  assert.equal(rule("PORTE DE ARMA").statusRegra, "conflitante")
  assert.equal(category(rule("ROUBO EM CHÁCARA, SÍTIO OU FAZENDA").categoriaProposta).nome, "Roubo em propriedade rural")
  for (const nature of ["ESTUPRO COLETIVO", "ESTUPRO CORRETIVO", "ESTUPRO COM RESULTADO MORTE"]) {
    assert.equal(category(rule(nature).categoriaProposta).nome, "Estupro")
    assert.equal(rule(nature).nivel, "revisada")
  }
  assert.equal(category(rule("ESTUPRO DE VULNERÁVEL").categoriaProposta).nome, "Estupro de vulnerável")
  assert.equal(category(rule("HOMICIDIO", true).categoriaProposta).nome, "Tentativa de homicídio")
  assert.equal(category(rule("FEMINICIDIO", true).categoriaProposta).nome, "Tentativa de feminicídio")
})

test("SQL: restrito ao clone, idempotente, sem homologação fora do ensaio e com o modelo de segurança revisado", () => {
  for (const name of ["0001_catalogo_proposta.sql", "0002_reclassificacao_backend.sql", "0003_homologacao_ensaio.sql"]) {
    const text = sql(name)
    assert.match(text, /inet_server_port\(\) <> 55487/, name)
    assert.doesNotMatch(text, /DISABLE ROW LEVEL|NO FORCE ROW LEVEL|session_replication_role|DROP TABLE|TRUNCATE/i, name)
  }
  const proposalSql = sql("0001_catalogo_proposta.sql")
  assert.equal((proposalSql.match(/INSERT INTO sentinela\.categorias_criminais/g) ?? []).length, 23)
  assert.equal((proposalSql.match(/INSERT INTO sentinela\.mapeamentos_natureza/g) ?? []).length, 43)
  assert.doesNotMatch(proposalSql, /'homologad[ao]'/)
  const rehearsalSql = sql("0003_homologacao_ensaio.sql")
  assert.equal((rehearsalSql.match(/,'homologado',/g) ?? []).length, 42)
  assert.equal((rehearsalSql.match(/NULL,'conflitante'\)/g) ?? []).length, 1)
  assert.match(rehearsalSql, /nao constitui homologacao institucional/)
  const backend = sql("0002_reclassificacao_backend.sql")
  assert.match(backend, /NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/)
  assert.match(backend, /DROP FUNCTION IF EXISTS sentinela_classificacao\.reclassificar/)
  assert.match(backend, /session_user = 'sentinela_local_admin'/)
  assert.match(backend, /p_conta = encode\(sha256\(convert_to\('\["sentinela-supabase",'/)
  assert.match(backend, /r\.versao_ativa IS NOT NULL/)
  assert.match(backend, /SET CONSTRAINTS ALL IMMEDIATE/)
  assert.match(backend, /pg_advisory_xact_lock/)
  assert.match(backend, /GRANT EXECUTE ON FUNCTION sentinela_classificacao\.aplicar_lote\(uuid, uuid, text, text\),\s+sentinela_classificacao\.reverter_lote\(uuid, text, uuid, text, text\) TO sentinela_local_admin;/)
  assert.doesNotMatch(backend, /TO sentinela_local_(operator|analyst)/)
  assert.equal((backend.match(/SECURITY DEFINER SET search_path = pg_catalog, pg_temp/g) ?? []).length, 3)
  assert.ok((backend.match(/p\.tipo = 'classificacao'/g) ?? []).length >= 2)
})

test("ensaio v2 registrado: janeiro, reversão e fevereiro conferidos", () => {
  assert.equal(rehearsal.naoHomologado, true)
  assert.equal(rehearsal.verificacoes.length, 32)
  assert.deepEqual([rehearsal.janeiro.resultado.mapeadas, rehearsal.janeiro.resultado.conflitantes, rehearsal.janeiro.resultado.desconhecidas], [6378, 14, 0])
  assert.equal(rehearsal.janeiro.resultado.pendenciasResolvidas, 6378)
  assert.deepEqual(rehearsal.janeiro.reversao.revertidas, 6392)
  assert.deepEqual([rehearsal.fevereiro.recibo.links, rehearsal.fevereiro.resultado.mapeadas, rehearsal.fevereiro.resultado.conflitantes], [5490, 5476, 14])
  assert.deepEqual([rehearsal.depois.ocorrencias, rehearsal.depois.associacoes], [6091 + 5221, 6393 + 5490])
})
