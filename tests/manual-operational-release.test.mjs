import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = path => readFileSync(new URL(path, root), "utf8")
const template = read("database/release/manual-occurrences-operational.psql.in")
const rollback = read("database/release/manual-occurrences-operational-rollback.psql")

function render() {
  const folder = mkdtempSync(join(tmpdir(), "sentinela-manual-release-"))
  try {
    const output = join(folder, "manual.psql")
    execFileSync("python", ["-I", new URL("database/release/render-manual-operational.py", root).pathname.replace(/^\/(\w:)/, "$1"),
      "--saida", output], { stdio: ["ignore", "pipe", "pipe"] })
    return readFileSync(output, "utf8")
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

test("pacote manual operacional: transação única, destino pinado e guardas revisadas", () => {
  const statements = template.split("\n").filter(line => /^(BEGIN|COMMIT|ROLLBACK);$/.test(line))
  assert.deepEqual(statements, ["BEGIN;", "COMMIT;"])
  for (const variable of ["cluster_uuid", "system_id", "supabase_url"]) assert.match(template, new RegExp(`:'${variable}'`))
  assert.doesNotMatch(template, /hcmqsqfbrynpfjvmuqdb/, "o projeto Supabase entra por variável de instalação")
  assert.match(template, /inet_server_port\(\) NOT IN \(55484,55487\)/)
  assert.match(template, /EXISTS \(SELECT FROM sentinela\.ocorrencias WHERE origem='manual'\)/)
  for (const hash of ["4d10efd1e9d002947e7f9d704ac185aa31c7cb295f3bcf4e810d502d84662cff",
    "6944306853bc1a6703721f411397e7dc3f4ec5a24811fc78ebf7c7ffac0f091d",
    "49c6b40f2fd8a8a67f8691831d960c048e4421cea4fdc4659c9a66cdcdf157cc"]) {
    assert.ok(template.includes(hash) && rollback.includes(hash), hash)
  }
  assert.doesNotMatch(template, /\b(DISABLE\s+(TRIGGER|ROW LEVEL)|NO FORCE|BYPASSRLS|DROP\s+(TABLE|SCHEMA|ROLE|POLICY|FUNCTION))\b/i)
  assert.doesNotMatch(template, /UPDATE\s+sentinela\.(naturezas_criminais|linhas_origem|lotes_importacao|linhas_staging)/i)
  assert.match(template, /localizacao_status='validada'/)
  assert.match(template, /perfil<>'Administrador'/, "publicação reservada ao Administrador")
})

test("catálogo local de uso manual: 41 descrições PCDF, sem código oficial nem homologação declarada", () => {
  const inventory = JSON.parse(read("docs/catalogos/naturezas-manuais-candidatas-v1.json"))
  const xml = JSON.parse(read("docs/catalogos/pcdf-naturezas-xml-v1.json"))
  assert.deepEqual(inventory.registros.map(row => row.descricaoOriginal), xml.naturezas)
  assert.ok(inventory.registros.every(row => row.codigoOriginal === null && row.usoManual === false))
  const sql = render()
  const payload = JSON.parse(sql.match(/\$dados\$(.*)\$dados\$/s)[1])
  assert.equal(payload.length, 41)
  assert.deepEqual(payload.map(row => row.descricao), xml.naturezas)
  assert.deepEqual(payload.map(row => row.codigo), xml.naturezas.map((_, index) => `PCDF-N-${String(index + 1).padStart(2, "0")}`))
  assert.match(sql, /'codigoOficial',NULL,'homologacaoInstitucional','ausente'/)
  assert.match(sql, /situacao='uso-local-provisorio'/)
  assert.doesNotMatch(sql, /'homologada'/)
  assert.doesNotMatch(sql, /__[A-Z_]+__/)
  assert.equal(createHash("sha256").update(sql).digest("hex"), createHash("sha256").update(render()).digest("hex"))
})

test("reversão: recusa dados manuais gravados e restaura definições originais", () => {
  assert.match(rollback, /OR EXISTS \(SELECT FROM sentinela\.ocorrencias WHERE origem='manual'\)/)
  assert.match(rollback, /depois->>'operacao'='cadastro-manual'/)
  assert.match(rollback, /FROM sentinela_ocorrencias_manual\.definicoes_originais/)
  assert.match(rollback, /GRANT SELECT \(id,origem,fonte\) ON sentinela\.ocorrencias TO sentinela_manual_writer/)
  assert.deepEqual(rollback.split("\n").filter(line => /^(BEGIN|COMMIT|ROLLBACK);$/.test(line)), ["BEGIN;", "COMMIT;"])
})

test("API manual operacional: autoria institucional e funções do pacote", () => {
  const manual = read("src/app/api/v1/ocorrencias/manuais/route.ts")
  const management = read("src/app/api/v1/ocorrencias/gestao/route.ts")
  const review = read("src/lib/db/operational-import-review.ts")
  assert.match(manual, /cadastrar_completo\(\$1,\$2,\$3,\$4\)/)
  assert.match(manual, /actor\.account, actor\.subject/)
  assert.match(management, /sentinela_ocorrencias_manual\.transicionar\(\$1,\$2,\$3\)/)
  assert.match(management, /consolidar_manual: "SELECT/)
  assert.match(management, /command\.acao === "consolidar_manual" \? "administrar"/)
  assert.match(review, /principal\.role !== "Administrador" && principal\.role !== "Operador"/)
  assert.match(review, /"sentinela-supabase", config\.url, principal\.authUserId/)
})

test("local-manual-0005: sem vínculo fora do contrato de exclusão e retirada validada por auditoria", () => {
  const sql = read("database/release/manual-occurrences-operational-0005.psql")
  assert.deepEqual(sql.split("\n").filter(line => /^(BEGIN|COMMIT|ROLLBACK);$/.test(line)), ["BEGIN;", "COMMIT;"])
  assert.match(sql, /DROP CONSTRAINT naturezas_retiradas_auditoria_id_fkey/)
  assert.match(sql, /CREATE CONSTRAINT TRIGGER retirada_exige_auditoria AFTER INSERT/)
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/)
  assert.match(sql, /e\.transacao_id=pg_current_xact_id\(\)/)
  assert.match(sql, /EXISTS \(SELECT FROM sentinela_exclusao\.vinculos_inesperados\(\)\)/)
  assert.match(rollback, /DROP FUNCTION IF EXISTS sentinela_ocorrencias_manual\.validar_retirada\(\)/)
})

test("gestão de importação: artefato instalado preservado e verificação aceita apenas o estado pós-0004 legítimo", () => {
  const source = read("database/release/render-operational-import-management.py")
  assert.match(source, /def validate_installed_guards/)
  assert.match(source, /versao='local-manual-0004-revertida'/)
  assert.match(source, /postflight\(protected, installed=True\)/)
  assert.match(source, /checks = postflight\(protected\)\n    fingerprint = sha256\(\(install \+ checks\)/)
  const script = new URL("database/release/render-operational-import-management.py", root).pathname.replace(/^\/(\w:)/, "$1")
  const digests = execFileSync("python", ["-I", "-c", `import importlib.util;s=importlib.util.spec_from_file_location('r',r'${script}');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.manual_guard_bodies())`]).toString()
  assert.match(digests, /337ba4c7a068026f0d9f5e9c0b48ee5d1c69b286793e7bdaeeb601faad7608ae/)
  assert.match(digests, /dd9101eae850d9bdb981dba3531b3cd4309b8096f9212f9a4a69fbf7a4d24474/)
})

test("vínculo de Operador: identidade comprovada, sem reuso de linhas técnicas e ensaio por padrão", () => {
  const sql = read("database/release/register-supabase-operator.psql")
  assert.ok(sql.includes("\\set confirmar off"))
  assert.ok(sql.includes("\\if :confirmar\nCOMMIT;\n\\else\nROLLBACK;"))
  assert.match(sql, /6ca6f86c-56da-4af8-8249-3291fb263c52/)
  assert.match(sql, /'provisionamento_controlado','provisionar_vinculo'/)
  assert.doesNotMatch(sql, /INSERT INTO sentinela_gestao_autorizacao/)
})
