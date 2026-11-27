"""Back up and restore the attested PCDF installation into a private local clone."""

from argparse import ArgumentParser
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
from datetime import datetime, timezone
from hashlib import file_digest
from uuid import uuid4

from direct_runtime import BASE, DATABASE, ROLES, backup, configure_controller, control, profile_query, secret, store
from integrated_restore import POLICY_ROLES
from local_dev_postgres import server_is_running, verify_postgres_process

SOURCE = 55484
CLONE = 55487
RECOVERY = 55489
BIN = Path("C:/Program Files/PostgreSQL/17/bin")
ROOT = BASE.parent / "homologacao-clone"
ROLES_SQL = """
SELECT 'REVOKE CONNECT,TEMPORARY ON DATABASE sentinela_pcdf_local FROM PUBLIC;'
UNION ALL
SELECT 'GRANT '||a.privilege_type||' ON DATABASE sentinela_pcdf_local TO '||
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END ||
 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION;' ELSE ';' END
FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
WHERE d.datname=current_database() AND a.grantee<>d.datdba;
"""
PROPERTY = """
SELECT jsonb_build_object('host',host(inet_server_addr()),'port',inet_server_port(),
 'name',current_database(),'uuid',current_setting('sentinela.sandbox_uuid',true),
 'system',system_identifier::text,'folder',current_setting('data_directory'),
 'start',extract(epoch FROM pg_postmaster_start_time())::bigint::text,
 'version',current_setting('server_version_num'),'readonly',current_setting('transaction_read_only'),
 'postgis',(SELECT extversion FROM pg_extension WHERE extname='postgis'))
FROM pg_control_system()
"""
FINGERPRINTS = r"""
SELECT format($fmt$SELECT %L,count(*),encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex')
  FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') h FROM %I.%I t) s$fmt$,
  n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND (n.nspname='extensions' OR n.nspname='sentinela' OR n.nspname LIKE 'sentinela\_%')
ORDER BY n.nspname,c.relname
\gexec
"""
FUNCTION_ACL = """
SELECT format('GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO %I;',r.rolname)
FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee
WHERE p.oid='pg_catalog.pg_control_system()'::regprocedure AND a.privilege_type='EXECUTE'
 AND r.rolname IN ('sentinela_local_admin','sentinela_local_operator','sentinela_ocorrencias_reader','sentinela_gestao_autoridade')
ORDER BY r.rolname
"""


def digest(path):
    with path.open("rb") as data:
        return file_digest(data, "sha256").hexdigest()


def lot_policy_schema(lines):
    """Allow only the grouping rewrite for the known OR tree in gestao_lote.

    pg_dump prints that policy with an explicit nested OR; restoring re-parses the text and
    PostgreSQL flattens the OR, so the restored deparse has fewer parentheses. Same semantics.
    """
    header = "CREATE POLICY gestao_lote ON sentinela.lotes_importacao "
    key = "  WHERE ((x.id = lotes_importacao.extracao_id) AND "
    lines = list(lines)
    for i, line in enumerate(lines):
        if line.startswith(header) and i + 2 < len(lines) and lines[i + 2].startswith(key):
            body = lines[i + 2]
            second_branch = "'2.0'::text))) OR"
            if body.count(" OR ") == 2 and body.startswith(key + "(((((") and body.count(second_branch) == 1:
                lines[i + 2] = body.replace(key + "(((((", key + "((((", 1).replace(second_branch, "'2.0'::text)) OR")
    return lines


def private_root():
    control.no_links(BASE.parent)
    root = ROOT / ("clone-" + uuid4().hex)
    # Create with a protected DACL before writing any dump, account or log.
    script = """
    $ErrorActionPreference='Stop'
    $target=[IO.Path]::GetFullPath($env:SENTINELA_CLONE_PRIVATE_DIR)
    $user=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $access=New-Object Security.AccessControl.DirectorySecurity
    $access.SetSecurityDescriptorSddlForm("D:P(A;OICI;FA;;;$user)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)")
    if(Test-Path -LiteralPath $target) { throw 'Destino privado já existe' }
    [IO.Directory]::CreateDirectory($target,$access) | Out-Null
    $actual=[IO.Directory]::GetAccessControl($target)
    if(-not $actual.AreAccessRulesProtected) { throw 'DACL privada ausente' }
    $allowed=@($user,'S-1-5-18','S-1-5-32-544')
    foreach($rule in $actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
      if($rule.IdentityReference.Value -notin $allowed) { throw 'Acesso externo ao clone' }
    }
    """
    subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], check=True,
                   env={**os.environ, "SENTINELA_CLONE_PRIVATE_DIR": str(root)})
    control.no_links(root)
    return root


def pg(exe, *args, password=None, source=False, input=None, capture=True):
    opts = backup.clean_env(password, source)
    return subprocess.run([str(BIN / (exe + ".exe")), *map(str, args)], env=opts, input=input,
                          stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                          stderr=subprocess.PIPE if capture else subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace",
                          timeout=180, check=True).stdout


def address(port, db=DATABASE, role="postgres"):
    return ("-w", "-h", "127.0.0.1", "-p", str(port), "-U", role, "-d", db)


def query(port, password, sql, db=DATABASE, role="postgres"):
    return pg("psql", "-X", "-qAt", *address(port, db, role), "-v", "ON_ERROR_STOP=1", "-P", "pager=off",
              "-f", "-", password=password, source=port == SOURCE, input=sql).strip()


def fingerprint_schema(port, password, options=()):
    raw = pg("pg_dump", *address(port), "--schema-only", *options, password=password, source=port == SOURCE)
    return [POLICY_ROLES.sub(lambda m: m[1] + ", ".join(sorted(m[2].split(", "))), line)
            for line in raw.splitlines() if not line.startswith(("\\restrict ", "\\unrestrict "))]


def source_snapshot(root):
    configure_controller()
    paths = [p for p in BASE.glob("rls-sandbox-*/manifest.json")
             if json.loads(p.read_text(encoding="utf-8")).get("pcdf_purpose") == "operacional"]
    if len(paths) != 1:
        raise RuntimeError("Manifesto da origem deve ser único.")
    manifest = control.load(paths[0])
    if manifest["port"] != SOURCE or not server_is_running(manifest):
        raise RuntimeError("Origem atestada indisponível.")
    password = secret(Path(manifest["root"]), "admin.dpapi")
    control.attest(manifest, password, run=backup.bootstrap_runner(backup.Commands(), password),
                   process_check=verify_postgres_process)
    origin = json.loads(query(SOURCE, password, PROPERTY + ";"))
    assert (origin["uuid"], origin["system"], origin["port"], origin["readonly"]) == (
        manifest["uuid"], manifest["system_id"], SOURCE, "on")
    assert (origin["name"], origin["host"], origin["version"], origin["postgis"]) == (
        DATABASE, "127.0.0.1", "170011", "3.6.2")
    assert Path(origin["folder"]).resolve() == Path(manifest["data"]).resolve()
    archive = root / "origem.dump"
    with (root / "snapshot-diagnostics.log").open("x", encoding="utf-8") as diagnostics:
        with subprocess.Popen([str(BIN / "psql.exe"), "-X", "-qAt", *address(SOURCE), "-v", "ON_ERROR_STOP=1"],
                              env=backup.clean_env(password, True), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=diagnostics, text=True, encoding="utf-8") as session:
            try:
                session.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n")
                session.stdin.flush()
                snapshot = session.stdout.readline().strip()
                assert re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", snapshot)
                opts = ("--snapshot", snapshot)
                pg("pg_dump", *address(SOURCE), "--format=custom", "--file", archive, *opts, password=password, source=True)
                source_schema = fingerprint_schema(SOURCE, password, opts)
                session.stdin.write(FINGERPRINTS + "\nROLLBACK;\n\\q\n")
                session.stdin.flush()
                fingerprints = session.stdout.read().strip().splitlines()
                assert session.wait(timeout=60) == 0
                assert any(row.startswith("sentinela.linhas_staging|") for row in fingerprints)
            finally:
                if session.poll() is None:
                    session.stdin.close()
    role_dump = pg("pg_dumpall", "-w", "-h", "127.0.0.1", "-p", SOURCE, "-U", "postgres",
                   "--roles-only", "--no-role-passwords", password=password, source=True)
    assert role_dump.splitlines().count("CREATE ROLE postgres;") == 1
    roles = "\n".join(line for line in role_dump.splitlines() if line != "CREATE ROLE postgres;")
    grants = query(SOURCE, password, FUNCTION_ACL + ";")
    assert len(grants.splitlines()) == (
        4 if query(SOURCE, password, "SELECT to_regnamespace('sentinela_gestao_autorizacao') IS NOT NULL;") == "t" else 3
    )
    acl = query(SOURCE, password, ROLES_SQL)
    with archive.open("rb") as handle:
        assert handle.read(5) == b"PGDMP"
    toc = pg("pg_restore", "--list", archive)
    assert "TABLE DATA" in toc and "linhas_staging" in toc and "eventos_auditoria" in toc
    pg("pg_restore", "--file", os.devnull, archive)
    meta = {"origin": origin, "sha256": digest(archive), "bytes": archive.stat().st_size,
            "utc": datetime.now(timezone.utc).isoformat(), "format": "PGDMP", "pg_dump": pg("pg_dump", "--version").strip(),
            "tocEntries": sum(line[:1].isdigit() for line in toc.splitlines()),
            "tables": len(fingerprints)}
    for name, data in (("roles.sql", roles), ("database-acl.sql", acl), ("system-acl.sql", grants),
                       ("schema.json", json.dumps(source_schema)), ("fingerprints.json", json.dumps(fingerprints))):
        with (root / name).open("x", encoding="utf-8", newline="\n") as h:
            h.write(data + "\n")
    meta["sidecars"] = {name: digest(root / name) for name in
                        ("roles.sql", "database-acl.sql", "system-acl.sql", "schema.json", "fingerprints.json")}
    (root / "backup.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps({key: meta[key] for key in ("sha256", "bytes", "utc", "format", "pg_dump", "tocEntries", "tables")}), flush=True)
    return meta


def free_port(port):
    assert port in (CLONE, RECOVERY)
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        listener.bind(("127.0.0.1", port))


def attest_clone(root, port, password, marker, source, db=DATABASE):
    assert port in (CLONE, RECOVERY) and port != SOURCE
    actual = json.loads(query(port, password, PROPERTY + ";", db))
    assert (actual["port"], actual["host"], actual["uuid"], actual["name"], actual["version"]) == (
        port, "127.0.0.1", marker, db, "170011")
    assert actual["uuid"] != source["uuid"] and actual["system"] != source["system"]
    assert Path(actual["folder"]).resolve() == (root / f"data-{port}").resolve()
    return actual


def restore(root, meta, port, *, normalize_schema=None):
    free_port(port)
    data = root / f"data-{port}"
    assert not data.exists()
    assert digest(root / "origem.dump") == meta["sha256"]
    assert all(digest(root / name) == value for name, value in meta["sidecars"].items())
    marker = str(uuid4())
    password = secrets.token_hex(32)
    password_file = root / f"init-{port}"
    with password_file.open("x", encoding="ascii") as file:
        file.write(password + "\n")
    try:
        pg("initdb", "-D", data, "-U", "postgres", "--encoding=UTF8", "--locale=C",
           "--auth=scram-sha-256", "--pwfile=" + str(password_file))
    finally:
        password_file.unlink()
    with (data / "postgresql.auto.conf").open("a", encoding="ascii") as file:
        file.write(f"listen_addresses='127.0.0.1'\nport={port}\nsentinela.sandbox_uuid='{marker}'\n"
                   "log_statement='none'\nlog_error_verbosity='terse'\nlog_min_error_statement='panic'\n")
    store(root, f"admin-{port}.dpapi", password)
    pg("pg_ctl", "-D", data, "-l", root / f"postgres-{port}.log", "-w", "start", capture=False)
    return restore_database(root, meta, port, password, marker, normalize_schema=normalize_schema)


def restore_database(root, meta, port, password, marker, *, normalize_schema=None):
    assert digest(root / "origem.dump") == meta["sha256"]
    assert all(digest(root / name) == value for name, value in meta["sidecars"].items())
    first = attest_clone(root, port, password, marker, meta["origin"], "postgres")
    for sql in ((root / "roles.sql").read_text(encoding="utf-8"),
                f"CREATE DATABASE {DATABASE} TEMPLATE template0 ENCODING 'UTF8';"):
        query(port, password, sql, "postgres")
    attest_clone(root, port, password, marker, meta["origin"])
    pg("pg_restore", *address(port), "--exit-on-error", "--single-transaction", root / "origem.dump",
       password=password)
    for name in ("database-acl.sql", "system-acl.sql"):
        query(port, password, (root / name).read_text(encoding="utf-8"))
    identity = attest_clone(root, port, password, marker, meta["origin"])
    assert identity["system"] == first["system"] and identity["postgis"] == "3.6.2"
    expected = json.loads((root / "schema.json").read_text(encoding="utf-8"))
    actual = fingerprint_schema(port, password)
    if normalize_schema is not None:
        expected, actual = normalize_schema(expected), normalize_schema(actual)
    assert actual == expected, "Schema restaurado divergente"
    hashes = query(port, password, "BEGIN READ ONLY;\n" + FINGERPRINTS + "\nROLLBACK;\n").splitlines()
    assert hashes == json.loads((root / "fingerprints.json").read_text(encoding="utf-8")), "Conteudo restaurado divergente"
    for role in ROLES:
        proof = query(port, password, f"""SET SESSION AUTHORIZATION {role}; BEGIN READ ONLY;
          SELECT sentinela_ocorrencias_local.identidade()->>'login'=session_user::text; ROLLBACK;""")
        assert proof == "t"
    (root / f"identity-{port}.json").write_text(json.dumps(identity, indent=2), encoding="utf-8")
    print(json.dumps({"port": port, "schemaMatches": True, "tables": len(hashes), "dataMatches": True,
                      "postgresql": identity["version"], "postgis": identity["postgis"], "profiles": 3}), flush=True)
    return identity, password


def existing_root(name):
    if not re.fullmatch(r"clone-[0-9a-f]{32}", name):
        raise ValueError("Identificador privado do clone inválido.")
    root = ROOT / name
    control.no_links(root)
    if root.resolve(strict=True).parent != ROOT.resolve(strict=True):
        raise ValueError("Diretório do clone fora de escopo.")
    return root


def stop_clone(root, port, password, marker, source):
    attest_clone(root, port, password, marker, source)
    pg("pg_ctl", "-D", root / f"data-{port}", "-m", "fast", "-w", "stop", capture=False)


def seal(root):
    meta = json.loads((root / "backup.json").read_text(encoding="utf-8"))
    identity = json.loads((root / f"identity-{CLONE}.json").read_text(encoding="utf-8"))
    password = secret(root, f"admin-{CLONE}.dpapi")
    clone = attest_clone(root, CLONE, password, identity["uuid"], meta["origin"])
    assert clone["system"] == identity["system"] and digest(root / "origem.dump") == meta["sha256"]
    before = json.loads((root / "fingerprints.json").read_text(encoding="utf-8"))
    after = query(CLONE, password, "BEGIN READ ONLY;\n" + FINGERPRINTS + "\nROLLBACK;\n").splitlines()
    independent = ("sentinela.ocorrencias|", "sentinela.ocorrencia_naturezas|")
    assert [row for row in before if row.startswith(independent)] == [row for row in after if row.startswith(independent)]
    assert query(CLONE, password, "SELECT NOT aberta FROM sentinela_gestao_autorizacao.release WHERE singleton;") == "t"
    configure_controller()
    manifests = [p for p in BASE.glob("rls-sandbox-*/manifest.json")
                 if json.loads(p.read_text(encoding="utf-8")).get("pcdf_purpose") == "operacional"]
    assert len(manifests) == 1
    manifest = control.load(manifests[0])
    assert (manifest["uuid"], manifest["system_id"], manifest["port"]) == (meta["origin"]["uuid"], meta["origin"]["system"], SOURCE)
    root_source = Path(manifest["root"])
    admin = secret(root_source, "admin.dpapi")
    runner = backup.bootstrap_runner(backup.Commands(), admin)
    source = json.loads(profile_query(manifest, runner, secret(root_source, ROLES[0] + ".dpapi"), ROLES[0], """
      BEGIN READ ONLY;
      SELECT jsonb_build_object('deltaInstalled',to_regnamespace('sentinela_gestao_autorizacao') IS NOT NULL,
        'januaryAssociations', (sentinela_ocorrencias_local.lista('importados','{"competencia":"2021-01"}',1,'identificacao','asc')->>'total')::int);
      ROLLBACK;"""))
    assert source == {"deltaInstalled": False, "januaryAssociations": 6393}
    stop_clone(root, CLONE, password, identity["uuid"], meta["origin"])
    print(json.dumps({"cloneStopped": True, "managementClosed": True, "independentRecordsUnchanged": True,
                      "source": source}), flush=True)


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = ArgumentParser(description=__doc__)
    option = parser.add_mutually_exclusive_group()
    option.add_argument("--resume-restore", metavar="CLONE")
    option.add_argument("--recovery", metavar="CLONE")
    option.add_argument("--seal", metavar="CLONE")
    args = parser.parse_args()
    name = args.resume_restore or args.recovery or args.seal
    root = existing_root(name) if name else private_root()
    try:
        if args.seal:
            seal(root)
        elif args.resume_restore:
            meta = json.loads((root / "backup.json").read_text(encoding="utf-8"))
            password = secret(root, f"admin-{CLONE}.dpapi")
            marker = query(CLONE, password, "SHOW sentinela.sandbox_uuid;", "postgres")
            attest_clone(root, CLONE, password, marker, meta["origin"], "postgres")
            assert query(CLONE, password, f"SELECT count(*) FROM pg_database WHERE datname='{DATABASE}';", "postgres") == "0"
            restore_database(root, meta, CLONE, password, marker, normalize_schema=lot_policy_schema)
        elif args.recovery:
            meta = json.loads((root / "backup.json").read_text(encoding="utf-8"))
            recorded = root / f"identity-{RECOVERY}.json"
            if recorded.is_file():
                saved = json.loads(recorded.read_text(encoding="utf-8"))
                password = secret(root, f"admin-{RECOVERY}.dpapi")
                identity = attest_clone(root, RECOVERY, password, saved["uuid"], meta["origin"])
                assert identity["system"] == saved["system"]
                assert digest(root / "origem.dump") == meta["sha256"]
            else:
                identity, password = restore(root, meta, RECOVERY, normalize_schema=lot_policy_schema)
            assert query(RECOVERY, password, """
            SELECT to_regnamespace('sentinela_gestao_autorizacao') IS NULL
             AND (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
               AND relkind='r' AND relrowsecurity AND relforcerowsecurity)=19;
            """) == "t"
            assert query(RECOVERY, password, """
            SET SESSION AUTHORIZATION sentinela_local_admin;
            BEGIN READ ONLY;
            SELECT (sentinela_ocorrencias_local.lista('importados','{"competencia":"2021-01"}',1,'identificacao','asc')->>'total')::int;
            ROLLBACK;
            """) == "6393"
            assert query(RECOVERY, password, """
            SELECT count(*)=0 FROM sentinela.eventos_auditoria
            WHERE depois->>'operacao'='gestao-importacao';
            """) == "t"
            stop_clone(root, RECOVERY, password, identity["uuid"], meta["origin"])
            print("Recuperacao independente do backup pre-migration confirmada.", flush=True)
        else:
            free_port(CLONE)
            print("Diretorio privado da homologacao: " + root.name, flush=True)
            restore(root, source_snapshot(root), CLONE, normalize_schema=lot_policy_schema)
    except subprocess.CalledProcessError as error:
        # Native errors may include row data. Keep diagnostics under the protected DACL.
        (root / "failure.log").write_text(error.stderr or "No native diagnostic", encoding="utf-8")
        raise SystemExit(f"Ferramenta PostgreSQL encerrou com código {error.returncode}. Diagnóstico na área privada.") from None
