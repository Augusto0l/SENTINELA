"""Transfer the authorized SENTINELA snapshot in one PostgreSQL transaction."""

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
from uuid import UUID

from prepare_institutional_installation import render_transfer_prefix


REF = "hcmqsqfbrynpfjvmuqdb"
BACKUP = Path("D:/Backups/SENTINELA/CUTOVER-20261126-221929-1814f641")
TABLES = (
    ("sentinela.regioes_administrativas", 37),
    ("sentinela.naturezas_criminais", 41),
    ("sentinela_ocorrencias_manual.naturezas_uso_local", 41),
    ("sentinela.extracoes_origem", 1),
    ("sentinela.lotes_importacao", 1),
    ("sentinela.execucoes_importacao", 1),
    ("sentinela.linhas_origem", 6393),
    ("sentinela.ocorrencias", 6091),
    ("sentinela.ocorrencia_naturezas", 6393),
    ("sentinela.linhas_staging", 6393),
    ("sentinela.pendencias_revisao", 26714),
    ("sentinela_ocorrencias_manual.cadastros", 1),
    ("sentinela_ocorrencias_analytics.pcdf_pontos", 5460),
    ("sentinela_pcdf_historico.arquivos", 1),
    ("sentinela_pessoas.contatos", 2),
    ("sentinela.eventos_auditoria", 21),
    ("sentinela_exclusao.comprovantes", 1),
)
ARCHIVES = {
    "sentinela.eventos_auditoria": "sentinela_migracao.auditoria_origem",
    "sentinela_exclusao.comprovantes": "sentinela_migracao.comprovantes_origem",
}
PROTECTED = (
    "auth.users", "auth.identities", "sentinela.usuarios", "sentinela.perfis",
    "sentinela.permissoes", "sentinela.perfil_permissoes", "sentinela.eventos_auditoria",
    "supabase_migrations.schema_migrations",
)
SETTINGS = """SET LOCAL TIME ZONE 'UTC';
SET LOCAL DateStyle='ISO, YMD';
SET LOCAL bytea_output='hex';
SET LOCAL extra_float_digits=3;
"""
ARCHIVE_DDL = """CREATE SCHEMA sentinela_migracao;
REVOKE ALL ON SCHEMA sentinela_migracao FROM PUBLIC, anon, authenticated, service_role,
  sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;
CREATE TABLE sentinela_migracao.auditoria_origem (LIKE sentinela.eventos_auditoria INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE sentinela_migracao.comprovantes_origem (LIKE sentinela_exclusao.comprovantes INCLUDING CONSTRAINTS INCLUDING INDEXES);
ALTER TABLE sentinela_migracao.auditoria_origem ADD FOREIGN KEY (usuario_id) REFERENCES sentinela.usuarios(id);
ALTER TABLE sentinela_migracao.auditoria_origem ADD FOREIGN KEY (ocorrencia_id) REFERENCES sentinela.ocorrencias(id);
ALTER TABLE sentinela_migracao.auditoria_origem ADD FOREIGN KEY (linha_origem_id) REFERENCES sentinela.linhas_origem(id);
ALTER TABLE sentinela_migracao.auditoria_origem ADD FOREIGN KEY (pendencia_id) REFERENCES sentinela.pendencias_revisao(id);
ALTER TABLE sentinela_migracao.auditoria_origem ADD FOREIGN KEY (execucao_id) REFERENCES sentinela.execucoes_importacao(id);
ALTER TABLE sentinela_migracao.auditoria_origem ADD FOREIGN KEY (correcao_id) REFERENCES sentinela.historico_correcoes(id);
CREATE FUNCTION sentinela_migracao.negar_reescrita() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $immutable$
BEGIN RAISE EXCEPTION 'Historico de origem imutavel' USING ERRCODE='55000'; END
$immutable$;
REVOKE ALL ON FUNCTION sentinela_migracao.negar_reescrita() FROM PUBLIC, anon, authenticated, service_role;
"""


def require(condition, label):
    if not condition:
        raise RuntimeError(label)


def assertion(predicate, label):
    return (
        f"DO $assert$ BEGIN IF ({predicate}) IS DISTINCT FROM TRUE THEN "
        f"RAISE EXCEPTION 'SENTINELA_TRANSFER_{label}'; END IF; END $assert$;\n"
    )


def digest(table, where=""):
    return ("SELECT jsonb_build_array(count(*),encode(sha256(convert_to(coalesce(string_agg(h,'' "
            "ORDER BY h COLLATE \"C\"),''),'UTF8')),'hex')) FROM (SELECT "
            "encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') h FROM "
            f"{table} t {where}) hashes")


def psql(helper, env, sql, timeout=180):
    return subprocess.run(helper.pg("psql", "-XwqAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", "-"),
                          input=sql, env=env, capture_output=True, timeout=timeout)


def readonly(helper, env, sql):
    result = psql(helper, env, ("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n" + SETTINGS + sql + "\nROLLBACK;\n").encode())
    require(result.returncode == 0, "Falha na consulta somente leitura")
    return [json.loads(line) for line in result.stdout.splitlines()]


def deployment_state(helper, env):
    return readonly(helper, env, """SELECT jsonb_build_object(
      'logical',(SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations),
      'physical',(SELECT array_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations),
      'occurrences',(SELECT count(*) FROM sentinela.ocorrencias),
      'associations',(SELECT count(*) FROM sentinela.ocorrencia_naturezas),
      'limits',(SELECT count(*) FROM sentinela.regioes_administrativas),
      'audit',(SELECT count(*) FROM sentinela.eventos_auditoria),
      'auth',(SELECT count(*) FROM auth.users),
      'active',(SELECT count(*) FROM sentinela.usuarios WHERE ativo AND auth_user_id IS NOT NULL),
      'archive',to_regnamespace('sentinela_migracao') IS NOT NULL);""")[0]


def capture(helper, source_env, target_env):
    links = readonly(helper, target_env, """SELECT jsonb_build_array(u.id,u.auth_user_id,u.perfil,
      encode(sha256(convert_to(lower(btrim(a.email)),'UTF8')),'hex'))
      FROM sentinela.usuarios u JOIN auth.users a ON a.id=u.auth_user_id WHERE u.ativo ORDER BY u.id;""")
    require(len(links) == 3 and {row[2] for row in links} == {"Administrador", "Operador", "Analista"}, "Vinculos do destino divergentes")
    expected = json.loads(Path("tmp/pre-implantacao/transfer-readonly-inventory.json").read_text(encoding="utf8"))["source"]["counts"]
    require(len(expected) == 35, "Classificacao da origem incompleta")
    require(all(re.fullmatch(r"sentinela[\w]*\.\w+", table) for table in expected), "Nome invalido no inventario")
    pairs = []
    for subject, identity, profile, email in links:
        require(email is not None and re.fullmatch(r"[0-9a-f]{64}", email), "Email institucional sem hash valido")
        pairs.append(f"('{UUID(subject)}'::uuid,'{UUID(identity)}'::uuid,'{profile}','{email}')")
    linked = "(VALUES " + ",".join(pairs) + ") AS verified(subject,identity,profile,email)"
    contacts = f"""WHERE EXISTS (SELECT FROM sentinela.usuarios u JOIN {linked}
       ON u.id=verified.subject AND u.auth_user_id=verified.identity AND u.perfil=verified.profile
       WHERE u.id=t.usuario AND u.ativo AND t.orgao IS NOT NULL
       AND encode(sha256(convert_to(lower(btrim(t.email)),'UTF8')),'hex')=verified.email)"""
    source_query = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n" + SETTINGS
    source_query += "SELECT jsonb_build_array(inet_server_port(),current_database(),current_setting('transaction_read_only'));\n"
    source_query += assertion(f"(SELECT count(*) FROM sentinela.usuarios u JOIN {linked} ON "
                              "u.id=verified.subject AND u.auth_user_id=verified.identity AND u.perfil=verified.profile WHERE u.ativo)=3", "SOURCE_AUTH")
    source_query += """SELECT jsonb_object_agg(n.nspname||'.'||c.relname,0) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p') AND n.nspname LIKE 'sentinela%';\n"""
    source_query += "SELECT jsonb_build_object(" + ",".join(f"'{name}',(SELECT count(*) FROM {name})" for name in expected) + ");\n"
    for i, (table, _) in enumerate(TABLES):
        where = contacts if table == "sentinela_pessoas.contatos" else ""
        if table == "sentinela_pcdf_historico.arquivos":
            where = "WHERE competencia IN (SELECT DISTINCT competencia FROM sentinela.lotes_importacao)"
        source_query += f"SELECT {i};\n" + digest(table, where) + ";\n"
        source_query += f"COPY (SELECT to_jsonb(t)::text FROM {table} t {where}) TO STDOUT;\nSELECT 'END_COPY_{i}';\n"
    result = psql(helper, source_env, (source_query + "ROLLBACK;\n").encode())
    require(result.returncode == 0, "Falha no snapshot operacional somente leitura")
    lines = iter(result.stdout.splitlines())
    require(json.loads(next(lines)) == [55484, "sentinela_pcdf_local", "on"], "Identidade da origem divergente")
    require(set(json.loads(next(lines))) == set(expected), "Divergencia na lista de 35 tabelas")
    require(json.loads(next(lines)) == expected, "Contagens da origem mudaram")
    payloads = []
    for i, (table, count) in enumerate(TABLES):
        require(next(lines) == str(i).encode(), "Marcador de exportacao ausente")
        fingerprint = json.loads(next(lines))
        require(fingerprint[0] == count and re.fullmatch(r"[0-9a-f]{64}", fingerprint[1]), f"Inventario divergente: {table}")
        data = []
        for line in lines:
            if line == f"END_COPY_{i}".encode():
                break
            require(line.startswith(b'{') and line.endswith(b'}'), "Formato COPY inesperado")
            data.append(line)
        require(len(data) == count, f"Contagem COPY divergente: {table}")
        payloads.append((table, fingerprint, b"\n".join(data) + b"\n"))
    require(next(lines, None) is None, "Saida excedente no snapshot")
    return payloads, linked


def transaction(payloads, linked, start):
    # The source data is inserted only after DDL and all six installation guards succeed.
    prefix = render_transfer_prefix(start)
    head, rest = prefix.split("BEGIN;\n", 1)
    chunks = [head + "BEGIN ISOLATION LEVEL REPEATABLE READ;\n" + SETTINGS]
    chunks.append("CREATE TEMP TABLE protected_before (object text PRIMARY KEY, fingerprint jsonb) ON COMMIT DROP;\n")
    for table in PROTECTED:
        chunks.append(f"INSERT INTO protected_before SELECT '{table}', ({digest(table)});\n")
    chunks.append("CREATE TEMP TABLE audit_before ON COMMIT DROP AS SELECT id FROM sentinela.eventos_auditoria;\n")
    chunks.append(rest + ARCHIVE_DDL)
    for table in ARCHIVES.values():
        chunks += [f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;\nALTER TABLE {table} FORCE ROW LEVEL SECURITY;\n",
                   f"REVOKE ALL ON TABLE {table} FROM PUBLIC, anon, authenticated, service_role, sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;\n",
                   f"CREATE TRIGGER origem_imutavel BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION sentinela_migracao.negar_reescrita();\n"]
    chunks.append("CREATE TEMP TABLE incoming (payload jsonb NOT NULL) ON COMMIT DROP;\n")
    expected_hashes = {}
    for table, fingerprint, data in payloads:
        target = ARCHIVES.get(table, table)
        expected_hashes[table] = {"rows": fingerprint[0], "sha256": fingerprint[1]}
        chunks.append(f"SELECT 'load:{target}';\n" + assertion(f"NOT EXISTS(SELECT FROM {target})", "TARGET_NOT_EMPTY"))
        chunks.append("TRUNCATE pg_temp.incoming;\nCOPY pg_temp.incoming(payload) FROM STDIN;\n")
        chunks.extend((data, b"\\.\n"))
        chunks.append(f"INSERT INTO {target} SELECT (jsonb_populate_record(NULL::{target}, payload)).* FROM pg_temp.incoming;\n")
        chunks.append(assertion(f"({digest(target)})='{json.dumps(fingerprint)}'::jsonb", "ROW_FINGERPRINT"))
    chunks.append("SET CONSTRAINTS ALL IMMEDIATE;\n")
    chunks.append(assertion(f"(SELECT count(*) FROM sentinela_pessoas.contatos c JOIN sentinela.usuarios u ON u.id=c.usuario JOIN {linked} "
                            "ON u.id=verified.subject AND u.auth_user_id=verified.identity AND u.perfil=verified.profile "
                            "WHERE u.ativo AND c.orgao IS NOT NULL AND encode(sha256(convert_to(lower(btrim(c.email)),'UTF8')),'hex')=verified.email)=2", "CONTACT_LINKS"))
    chunks.append(assertion("""(SELECT count(*) FROM sentinela.regioes_administrativas WHERE limite IS NOT NULL
      AND extensions.ST_SRID(limite)=4326 AND extensions.ST_IsValid(limite))=37
      AND (SELECT count(*) FROM sentinela.ocorrencias WHERE geometria IS NOT NULL
      AND extensions.ST_SRID(geometria)=4326 AND extensions.ST_IsValid(geometria))=1
      AND (SELECT count(*) FROM sentinela_ocorrencias_analytics.pcdf_pontos p
        JOIN sentinela.ocorrencias o ON o.id=p.ocorrencia_id AND o.versao=p.versao_ocorrencia
        WHERE extensions.ST_SRID(p.geometria)=4326 AND extensions.ST_IsValid(p.geometria)
        AND o.ativo AND o.consolidacao_status='consolidada' AND o.fonte='PCDF' AND o.origem='importacao')=5460""", "GEOMETRY"))
    chunks.append(assertion("""(SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity)=19
      AND (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela_migracao'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity)=2
      AND NOT EXISTS (SELECT FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role',
        'sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst')
        AND (has_schema_privilege(r.oid,'sentinela_migracao','USAGE')
          OR has_table_privilege(r.oid,'sentinela_migracao.auditoria_origem','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
          OR has_table_privilege(r.oid,'sentinela_migracao.comprovantes_origem','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')))
      AND NOT EXISTS (SELECT FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
       WHERE n.nspname LIKE 'sentinela%' AND c.contype='f' AND NOT c.convalidated)""", "RLS_FOREIGN_KEYS"))
    receipt = json.dumps({"source": "127.0.0.1:55484/sentinela_pcdf_local", "data": expected_hashes})
    chunks.append("INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa) VALUES "
                  f"('servico','sentinela-migracao','migracao.operacional',$recibo${receipt}$recibo$::jsonb,'Carga operacional autorizada');\n")
    for table in PROTECTED:
        where = "WHERE id IN (SELECT id FROM pg_temp.audit_before)" if table == "sentinela.eventos_auditoria" else ""
        if table == "supabase_migrations.schema_migrations":
            where = "WHERE version IN ('20261126163226','20261126163836')"
        chunks.append(assertion(f"({digest(table, where)})=(SELECT fingerprint FROM pg_temp.protected_before WHERE object='{table}')", "PRESERVATION"))
    chunks.append(assertion("(SELECT count(*) FROM sentinela.eventos_auditoria)=2 AND "
                            "(SELECT count(*) FROM supabase_migrations.schema_migrations)=5 AND "
                            "(SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations)="
                            "ARRAY(SELECT lpad(n::text,4,'0') FROM generate_series(1,11) n)", "FINAL_LEDGER"))
    chunks.append("SELECT 'PREFLIGHT_AND_LOAD_VALIDATED';\nCOMMIT;\nSELECT 'COMMIT_ACKNOWLEDGED';\n")
    return b"".join(part if isinstance(part, bytes) else part.encode() for part in chunks)


def main():
    require(sys.argv == [sys.argv[0], "--execute-institutional"], "Use autorizacao explicita e --execute-institutional")
    sys.argv = ["transfer", str(BACKUP), REF]
    spec = importlib.util.spec_from_file_location("attestation", "tmp/pre-implantacao/export-encrypted-backups.py")
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    source_env, _ = helper.local_env()
    target_env = helper.managed_env()
    before = deployment_state(helper, target_env)
    require(before == {"logical": [f"{n:04d}" for n in range(1, 9)], "physical": ["20261126163226", "20261126163836"],
                       "occurrences": 0, "associations": 0, "limits": 0, "audit": 1, "auth": 3,
                       "active": 3, "archive": False}, "Estado inicial do destino divergente")
    payloads, linked = capture(helper, source_env, target_env)
    start = datetime.now(timezone.utc)
    script = transaction(payloads, linked, start)
    print(json.dumps({"phase": "source_verified", "tables": len(payloads), "before": before}), flush=True)
    write_env = {**target_env, "PGOPTIONS": "-c default_transaction_read_only=off -c statement_timeout=120000"}
    try:
        result = psql(helper, write_env, script, timeout=480)
        markers = [line for line in result.stdout.decode("utf8", "replace").splitlines()
                   if re.fullmatch(r"(?:[0-9]{1,2}|load:sentinela[\w.]+|PREFLIGHT_AND_LOAD_VALIDATED|COMMIT_ACKNOWLEDGED)", line)]
        diagnostic = result.stderr.decode("utf8", "replace")
        errors = re.findall(r"\b(?:ERROR|ERRO|FATAL):\s+([A-Z0-9]{5}):", diagnostic)
        assertions = re.findall(r"SENTINELA_TRANSFER_[A-Z_]+", diagnostic)
        error_text = next((line.strip() for line in diagnostic.splitlines() if re.search(r"\b(?:ERROR|ERRO|FATAL):", line)), "")
        # Only emit coarse metadata. Database errors can contain values from a row.
        reference = re.search(r"<stdin>:(\d+)", error_text)
        print(json.dumps({"phase": "transaction_result", "exit": result.returncode, "checks": markers,
                          "sqlstates": errors, "checks_failed": assertions,
                          "statement_line": int(reference[1]) if reference else None}), flush=True)
    except subprocess.TimeoutExpired:
        print(json.dumps({"phase": "transaction_timeout"}), flush=True)
    after = deployment_state(helper, target_env)
    print(json.dumps({"phase": "read_only_confirmation", "after": after}), flush=True)
    if after == before:
        raise SystemExit(3)
    require(after["logical"] == [f"{n:04d}" for n in range(1,12)] and len(after["physical"]) == 5 and
            (after["occurrences"], after["associations"], after["limits"], after["audit"], after["auth"], after["active"], after["archive"]) ==
            (6091,6393,37,2,3,3,True), "Resultado remoto ambiguo, nova tentativa bloqueada")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, StopIteration) as error:
        raise SystemExit(str(error)[:240]) from None
