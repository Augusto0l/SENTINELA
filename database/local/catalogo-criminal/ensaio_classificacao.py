"""Etapa 3 rehearsal in the disposable clone 127.0.0.1:55487 (never 55484, Supabase or Vercel).

Applies sql/0001..0003 (each twice), opens the classification release IN THE CLONE, and checks: approver identity,
the three profiles, rolled-back and committed application, review-item reconciliation, repetition, compensating
reversal and re-application on January/2021, an active version without homologated rules, and automatic application
on February/2021 imported through the real receiver. Writes docs/catalogos/ensaio-classificacao-v2.json (aggregates).
Usage: python -B ensaio_classificacao.py <directory with the monthly CSVs>
"""
import json
import os
import re
import subprocess
import sys
from hashlib import sha256
from pathlib import Path

from clone_db import clone_root, oc, query, secret

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
CSV_DIR = sys.argv[1] if len(sys.argv) == 2 else sys.exit(__doc__)
JAN = "84908630-bd04-4a03-923d-616649c8de74"
ENSAIO, PROPOSTA = "pcdf-classificacao-v2-ensaio", "pcdf-classificacao-v2"
URL = "https://hcmqsqfbrynpfjvmuqdb.supabase.co"
ADMIN = "29e7ec39-192b-4790-9180-3df950969bfc"      # active Administrador bound to Supabase Auth
OPERADOR = "c513de57-7b21-45c1-ac65-60a8072f07a9"   # active Operador bound to Supabase Auth
WHY = "Ensaio da Etapa 3 em clone descartavel; sem homologacao institucional."
proposal = json.loads((REPO / "docs/catalogos/sentinela-classificacao-v2.json").read_text(encoding="utf-8"))
steps = []


def check(condition, label):
    if not condition:
        raise SystemExit(f"FALHOU: {label}")
    steps.append(label)


def run(sql):
    try:
        return query(sql)
    except subprocess.CalledProcessError as error:
        detail = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27}", "<uuid>", error.stderr or "")
        raise SystemExit("FALHOU em SQL:\n" + detail[:900]) from None


def value(sql):
    return json.loads(run(f"BEGIN READ ONLY;\n{sql.rstrip().rstrip(';')};\nROLLBACK;").splitlines()[-1])


def attempt(sql):
    try:
        out = query(sql)
        return True, json.loads(next(line for line in reversed(out.splitlines()) if line.startswith("{")))
    except subprocess.CalledProcessError as error:
        return False, re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27}", "<uuid>", (error.stderr or "").strip().splitlines()[0][:160])


def account(user):
    auth = value(f"SELECT to_jsonb(auth_user_id::text) FROM sentinela.usuarios WHERE id='{user}'")
    return sha256(('["sentinela-supabase",' + json.dumps(URL) + "," + json.dumps(auth) + "]").encode()).hexdigest()


def as_role(role, call, commit=True):
    return attempt(f"BEGIN;\nSET LOCAL SESSION AUTHORIZATION {role};\nSELECT {call};\n{'COMMIT' if commit else 'ROLLBACK'};")


def apply(lot, user=ADMIN, conta=None, role="sentinela_local_admin", commit=True):
    return as_role(role, f"sentinela_classificacao.aplicar_lote('{lot}','{user}','{conta or account(user)}','{WHY}')", commit)


def revert(lot, version=ENSAIO, commit=True):
    return as_role("sentinela_local_admin",
                   f"sentinela_classificacao.reverter_lote('{lot}','{version}','{ADMIN}','{account(ADMIN)}','{WHY}')", commit)


def release(**fields):
    sets = ", ".join(f"{k}={v}" for k, v in fields.items())
    run(f"UPDATE sentinela_classificacao.liberacao SET {sets};")


LOT_ASSOC = """(SELECT a.* FROM sentinela.ocorrencia_naturezas a JOIN sentinela.linhas_origem o ON o.id=a.linha_origem_id
  JOIN sentinela.lotes_importacao l ON l.extracao_id=o.extracao_id WHERE l.id='{lot}')"""


def lot_state(lot):
    return value(f"""SELECT jsonb_build_object(
 'status', (SELECT jsonb_object_agg(classificacao_status, c) FROM (SELECT classificacao_status, count(*) c FROM {LOT_ASSOC.format(lot=lot)} x GROUP BY 1) s),
 'pendClassAbertas', (SELECT count(*) FROM sentinela.pendencias_revisao p WHERE p.tipo='classificacao' AND p.status='aberta'
                      AND p.linha_origem_id IN (SELECT linha_origem_id FROM {LOT_ASSOC.format(lot=lot)} y)))""")


STATE = """SELECT jsonb_build_object(
 'ocorrencias', (SELECT count(*) FROM sentinela.ocorrencias), 'associacoes', (SELECT count(*) FROM sentinela.ocorrencia_naturezas),
 'status', (SELECT jsonb_object_agg(classificacao_status, c) FROM (SELECT classificacao_status, count(*) c FROM sentinela.ocorrencia_naturezas GROUP BY 1) s),
 'pendencias', (SELECT jsonb_object_agg(tipo || '/' || status, c) FROM (SELECT tipo, status, count(*) c FROM sentinela.pendencias_revisao GROUP BY 1, 2) p),
 'historico', (SELECT count(*) FROM sentinela.historico_correcoes), 'auditoria', (SELECT count(*) FROM sentinela.eventos_auditoria),
 'rlsForcada', (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity),
 'origem', (SELECT encode(sha256(convert_to(string_agg(to_jsonb(t)::text, '' ORDER BY id), 'UTF8')), 'hex') FROM sentinela.linhas_origem t),
 'staging', (SELECT encode(sha256(convert_to(string_agg(to_jsonb(t)::text, '' ORDER BY id), 'UTF8')), 'hex') FROM sentinela.linhas_staging t),
 'casos', (SELECT encode(sha256(convert_to(string_agg(to_jsonb(t)::text, '' ORDER BY id), 'UTF8')), 'hex') FROM sentinela.ocorrencias t),
 'naturezas', (SELECT encode(sha256(convert_to(string_agg(to_jsonb(t)::text, '' ORDER BY id), 'UTF8')), 'hex') FROM sentinela.naturezas_criminais t),
 'outrasPendencias', (SELECT encode(sha256(convert_to(string_agg(to_jsonb(t)::text, '' ORDER BY id), 'UTF8')), 'hex')
                      FROM sentinela.pendencias_revisao t WHERE tipo <> 'classificacao'));"""
POLICE = ("origem", "staging", "casos", "naturezas", "outrasPendencias", "ocorrencias", "associacoes", "rlsForcada")
PROFILE = """SELECT jsonb_build_object('importados', (sentinela_ocorrencias_local.lista('importados','{"competencia":"2021-01"}',1,'identificacao','asc')->>'total')::int,
 'consolidadas', (sentinela_ocorrencias_local.lista('consolidadas','{}',1,'data','desc')->>'total')::int)"""


def profiles():
    out = {}
    for role in ("sentinela_local_admin", "sentinela_local_operator", "sentinela_local_analyst"):
        ok, data = attempt(f"BEGIN READ ONLY;\nSET LOCAL SESSION AUTHORIZATION {role};\n{PROFILE};\nROLLBACK;")
        out[role] = data if ok else "negado"
    return out


# ---------------------------------------------------------------- baseline and installation
before = value(STATE)
jan0 = lot_state(JAN)
check(before["associacoes"] == 6393 and before["ocorrencias"] == 6091 and jan0["status"] == {"pendente": 6392}
      and before["rlsForcada"] == 19, "clone limpo: 6.091 ocorrências, 6.393 associações, janeiro todo pendente, RLS em 19 tabelas")
profiles0 = profiles()
for name in ("0001_catalogo_proposta.sql", "0002_reclassificacao_backend.sql", "0003_homologacao_ensaio.sql"):
    run((HERE / "sql" / name).read_text(encoding="utf-8"))
    first = value(STATE)
    run((HERE / "sql" / name).read_text(encoding="utf-8"))
    check(value(STATE) == first, f"{name}: segunda aplicação sem efeito (idempotente)")
installed = value(STATE)
check(all(installed[k] == before[k] for k in POLICE) and installed["status"] == before["status"],
      "instalação não altera associações, pendências nem dados policiais")
owner = value("""SELECT jsonb_build_object('attrs', (SELECT jsonb_build_array(rolcanlogin, rolsuper, rolbypassrls, rolinherit)
  FROM pg_roles WHERE rolname='sentinela_classificacao_owner'),
 'definer', (SELECT bool_and(prosecdef AND proconfig::text LIKE '%search_path=pg_catalog, pg_temp%')
  FROM pg_proc WHERE pronamespace='sentinela_classificacao'::regnamespace),
 'executores', (SELECT jsonb_object_agg(r, has_function_privilege(r, 'sentinela_classificacao.aplicar_lote(uuid,uuid,text,text)', 'EXECUTE'))
  FROM unnest(ARRAY['sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst','sentinela_ocorrencias_reader']) r),
 'liberacaoRls', (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='sentinela_classificacao.liberacao'::regclass));""")
check(owner["attrs"] == [False, False, False, False] and owner["definer"] and owner["liberacaoRls"]
      and owner["executores"] == {"sentinela_local_admin": True, "sentinela_local_operator": False,
                                  "sentinela_local_analyst": False, "sentinela_ocorrencias_reader": False},
      "dono NOLOGIN sem bypass; funções SECURITY DEFINER com search_path fixo; só o perfil Administrador executa")

marker = run("SHOW sentinela.sandbox_uuid;").splitlines()[-1].strip()
system = run("SELECT system_identifier::text FROM pg_control_system();").splitlines()[-1].strip()
run(f"""INSERT INTO sentinela_classificacao.liberacao(porta,cluster_uuid,system_id,supabase_url,versao_ativa,aberta)
VALUES (55487,'{marker}','{system}','{URL}','{ENSAIO}',true) ON CONFLICT (singleton) DO UPDATE SET aberta=true, versao_ativa='{ENSAIO}';""")

# ---------------------------------------------------------------- identity and profiles
check(not apply(JAN, conta="0" * 64)[0], "conta divergente da identidade Auth é recusada")
check(not apply(JAN, user=OPERADOR)[0], "Operador com conta correta não é aprovador")
check(not apply(JAN, role="sentinela_local_operator")[0] and not apply(JAN, role="sentinela_local_analyst")[0],
      "perfis Operador e Analista não executam a aplicação")
check(not attempt(f"SELECT sentinela_classificacao.aplicar_lote('{JAN}','{ADMIN}','{account(ADMIN)}','{WHY}');")[0],
      "executor técnico (session_user postgres) não é aceito como aprovador")
release(aberta="false")
check(not apply(JAN)[0], "liberação fechada recusa a aplicação")
release(aberta="true", versao_ativa="NULL")
check(not apply(JAN)[0], "sem versão ativa explícita nada é aplicado")
release(versao_ativa=f"'{ENSAIO}'")
check(not attempt("BEGIN; SELECT set_config('sentinela.classificacao_transacao', pg_current_xact_id()::text, true); "
                  "UPDATE sentinela.ocorrencia_naturezas SET classificacao_status=classificacao_status "
                  "WHERE id=(SELECT id FROM sentinela.ocorrencia_naturezas LIMIT 1); COMMIT;")[0],
      "UPDATE direto segue bloqueado mesmo com a marca de transação")
check(value(STATE) == installed, "tentativas recusadas não deixaram efeito")

# ---------------------------------------------------------------- January: rollback, apply, repeat
expected_jan_conflicts = sum(t["associacoes"] for t in json.loads((REPO / "docs/catalogos/pcdf-matriz-conjunta-2021-01.json")
                             .read_text(encoding="utf-8"))["triplas"] if t["natureza_original"] == "PORTE DE ARMA")
ok, rolled = apply(JAN, commit=False)
check(ok and rolled["mapeadas"] == 6392 - expected_jan_conflicts and rolled["conflitantes"] == expected_jan_conflicts
      and rolled["desconhecidas"] == 0 and value(STATE) == installed,
      f"ROLLBACK: {6392 - expected_jan_conflicts} mapeadas e {expected_jan_conflicts} conflitantes calculadas, nenhum efeito")
ok, done = apply(JAN)
applied = value(STATE)
jan1 = lot_state(JAN)
check(ok and done["mapeadas"] == rolled["mapeadas"] and done["pendenciasResolvidas"] == done["mapeadas"],
      "aplicação confirmada: cada associação mapeada resolveu sua pendência de classificação")
check(jan1["status"] == {"mapeada": done["mapeadas"], "conflitante": expected_jan_conflicts}
      and jan1["pendClassAbertas"] == jan0["pendClassAbertas"] - done["mapeadas"],
      "janeiro: conflitantes mantêm a pendência aberta; mapeadas a encerram")
check(all(applied[k] == installed[k] for k in POLICE), "localização, endereço, identificação, origem e staging preservados")
check(applied["historico"] - installed["historico"] == 2 * done["mapeadas"] + done["conflitantes"]
      and applied["auditoria"] - installed["auditoria"] == done["pendenciasResolvidas"] + 1,
      "histórico por campo e um evento por pendência resolvida, mais o evento do lote")
check(apply(JAN)[1]["mapeadas"] == 0 and value(STATE) == applied, "repetição: nada a aplicar, sem novos eventos")
check(profiles() == profiles0, "três perfis: mesmas contagens visíveis antes e depois (Analista conforme sua permissão)")

expected = {(r["naturezaOriginal"], r["crimeTentado"]): r["categoriaProposta"] for r in proposal["regras"] if r["statusRegra"] == "homologavel"}
mapped = value("""SELECT jsonb_agg(jsonb_build_array(g.n, g.t, g.c)) FROM (SELECT DISTINCT nc.descricao_original n, a.crime_tentado t, c.codigo_interno c
 FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais nc ON nc.id=a.natureza_id
 JOIN sentinela.mapeamentos_natureza m ON m.id=a.mapeamento_id JOIN sentinela.categorias_criminais c ON c.id=m.categoria_id) g;""")
check(all(expected[(n, t)] == c for n, t, c in mapped), "cada associação mapeada usa a categoria proposta para seu par (natureza, tentativa)")

# ---------------------------------------------------------------- compensating reversal and re-application
ok, reverted = revert(JAN)
jan2 = lot_state(JAN)
check(ok and reverted["revertidas"] == 6392 and reverted["pendenciasReabertas"] == done["pendenciasResolvidas"]
      and jan2 == jan0, "reversão compensatória: janeiro volta ao estado inicial e as pendências são reabertas")
after_revert = value(STATE)
check(all(after_revert[k] == installed[k] for k in POLICE) and after_revert["historico"] > applied["historico"],
      "reversão acrescenta histórico sem apagar registros anteriores")
check(revert(JAN)[1]["revertidas"] == 0, "segunda reversão: nada a reverter")
ok, again = apply(JAN)
check(ok and again["mapeadas"] == done["mapeadas"] and lot_state(JAN) == jan1, "reaplicação após a reversão reproduz o mesmo resultado")
after_jan = value(STATE)

# ---------------------------------------------------------------- February/2021: next lot through the real receiver
env = {**os.environ, "SENTINELA_PG_REVIEW_CLONE": secret(clone_root(), f"admin-{oc.CLONE}.dpapi")}
receipt = json.loads(subprocess.run(["node", "database/local/catalogo-criminal/importar_competencia.mjs", str(clone_root()), CSV_DIR, "2021-02"],
                                    cwd=REPO, env=env, capture_output=True, text=True, encoding="utf-8", check=True).stdout.strip().splitlines()[-1])
feb = receipt["lot"]
feb0 = lot_state(feb)
check(receipt["state"] == "done" and feb0["status"] == {"pendente": receipt["links"]},
      f"fevereiro importado pelo receptor real: {receipt['links']} associações entram pendentes")
release(versao_ativa=f"'{PROPOSTA}'")
ok, proposal_run = apply(feb)
check(ok and proposal_run["mapeadas"] == 0 and proposal_run["desconhecidas"] == receipt["links"] and lot_state(feb) == feb0,
      "versão ativa sem regras homologadas: tudo rejeitado com segurança, nada classificado")
release(versao_ativa="'pcdf-classificacao-inexistente'")
check(not apply(feb)[0], "versão ativa inexistente é recusada")
release(versao_ativa=f"'{ENSAIO}'")
ok, feb_run = apply(feb)
feb1 = lot_state(feb)
check(ok and feb_run["desconhecidas"] == 0 and feb1["status"] == {"mapeada": feb_run["mapeadas"], "conflitante": feb_run["conflitantes"]}
      and feb_run["pendenciasResolvidas"] == feb0["pendClassAbertas"] - feb1["pendClassAbertas"],
      f"aplicação no lote seguinte: {feb_run['mapeadas']} mapeadas, {feb_run['conflitantes']} conflitantes, 0 desconhecidas; "
      f"{feb_run['pendenciasResolvidas']} pendências de classificação a conciliar (o receptor atual não as cria)")
check(lot_state(JAN) == jan1, "classificar fevereiro não altera janeiro")
final = value(STATE)
check(final["ocorrencias"] == before["ocorrencias"] + receipt["unique"] and final["associacoes"] == before["associacoes"] + receipt["links"],
      f"contagens: ocorrências {before['ocorrencias']} + {receipt['unique']}, associações {before['associacoes']} + {receipt['links']}")

report = {"versao": "ensaio-classificacao-v2", "clone": clone_root().name, "porta": oc.CLONE, "naoHomologado": True,
          "antes": {k: before[k] for k in ("ocorrencias", "associacoes", "status", "pendencias")},
          "janeiro": {"inicial": jan0, "aplicado": jan1, "resultado": done, "reversao": reverted},
          "fevereiro": {"recibo": {k: receipt[k] for k in ("month", "state", "unique", "links")}, "resultado": feb_run, "estado": feb1},
          "depois": {k: final[k] for k in ("ocorrencias", "associacoes", "status", "pendencias")},
          "perfis": profiles0, "verificacoes": steps}
(REPO / "docs/catalogos/ensaio-classificacao-v2.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                                                 encoding="utf-8", newline="\n")
print(json.dumps({"verificacoes": len(steps), "janeiro": done, "fevereiro": feb_run}, ensure_ascii=False))
