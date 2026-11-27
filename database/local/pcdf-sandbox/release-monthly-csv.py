"""Restore and qualify a monthly PCDF CSV, then install the same delta on the attested local source."""
from argparse import ArgumentParser
from hashlib import sha256
import json
import os
from pathlib import Path
from runpy import run_path
import secrets
import subprocess
from uuid import UUID

from direct_runtime import ROLES
from operational_clone import (
    CLONE, FINGERPRINTS, PROPERTY, SOURCE, address, attest_clone, backup, configure_controller,
    control, digest, existing_root, fingerprint_schema, free_port, pg, private_root, query,
    restore, secret, source_snapshot, stop_clone, verify_postgres_process,
)
from pilot_recovery import scram

REPO = Path(__file__).resolve().parents[3]
MIGRATION = REPO / "database/release/pcdf-monthly-csv.psql"
FUNCTION = "sentinela_pcdf_local.receive_csv(uuid,uuid,text,jsonb,bytea)"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def apply_delta(destination, password):
    port = destination["port"]
    pg("psql", "-X", "-qAt", *address(port), "-v", f"port={port}",
       "-v", f"cluster_uuid={UUID(destination['uuid'])}", "-v", f"system_id={int(destination['system'])}",
       "-f", MIGRATION, password=password, source=port == SOURCE)


def qualify(csv):
    free_port(CLONE)
    root = private_root()
    print(root.name, flush=True)
    snapshot = source_snapshot(root)
    identity, password = restore(root, snapshot, CLONE)
    try:
        assert attest_clone(root, CLONE, password, identity["uuid"], snapshot["origin"])["system"] == identity["system"]
        run_path(str(REPO / "database/local/pcdf-sandbox/qualify-january-purge.py"))["rebind_clone"](
            password, identity, snapshot["origin"])
        apply_delta(identity, password)
        subject = UUID(query(CLONE, password,
                             "SELECT usuario FROM sentinela_gestao_autorizacao.atores WHERE validade>statement_timestamp();"))
        account = sha256(b'["sentinela-local","Administrador","admin.clone@example.test"]').hexdigest()
        credentials = {role: secrets.token_hex(32) for role in ROLES}
        role_changes = "".join(f"ALTER ROLE {role} PASSWORD '{scram(value)}';" for role, value in credentials.items())
        query(CLONE, password, f"""
        BEGIN;
          UPDATE sentinela_gestao_autorizacao.atores SET conta='{account}' WHERE usuario='{subject}';
          {role_changes}
        COMMIT;""")
        env = {key: value for key, value in os.environ.items()
               if not key.upper().startswith(("PG", "SENTINELA_", "SUPABASE", "NEXT_PUBLIC_SUPABASE"))}
        env.update(SENTINELA_OPERATIONAL_CLONE_ROOT=str(root), SENTINELA_CLONE_ADMIN_PASSWORD=password,
                   SENTINELA_CLONE_CSV_ACTOR=json.dumps([str(subject), account]))
        env.update({"SENTINELA_PCDF_LOCAL_PASSWORD_" + role: value for role, value in credentials.items()})
        subprocess.run(["node", "--experimental-strip-types", "scripts/check-pcdf-monthly-csv.mjs", str(csv)],
                       cwd=REPO, env=env, check=True, timeout=480)
    finally:
        stop_clone(root, CLONE, password, identity["uuid"], snapshot["origin"])


def activate(root):
    snapshot = read_json(root / "backup.json")
    proof = read_json(root / "csv-qualification.json")
    assert digest(root / "origem.dump") == snapshot["sha256"] == proof["restoredArchive"]
    assert proof["migrationSha256"] == digest(MIGRATION)
    assert proof["restoredTables"] == snapshot["tables"]
    assert all(proof[name] is True for name in ("rollback", "auditedEdit", "controlledPurge", "retainedReceipt"))
    for filename, expected in snapshot["sidecars"].items():
        assert digest(root / filename) == expected
    configure_controller()
    launcher = run_path(str(REPO / "database/local/pcdf-sandbox/serve-import-3000.py"))
    manifest = control.load(launcher["find_operational_manifest"]())
    assert manifest["port"] == SOURCE
    password = secret(Path(manifest["root"]), "admin.dpapi")
    control.attest(manifest, password, run=backup.bootstrap_runner(backup.Commands(), password),
                   process_check=verify_postgres_process)
    before = json.loads(query(SOURCE, password, PROPERTY + ";"))
    assert before == snapshot["origin"] and before["readonly"] == "on"
    assert fingerprint_schema(SOURCE, password) == read_json(root / "schema.json")
    assert query(SOURCE, password, FINGERPRINTS).splitlines() == read_json(root / "fingerprints.json")
    assert query(SOURCE, password, f"SELECT to_regprocedure('{FUNCTION}') IS NULL;") == "t"
    apply_delta(before, password)
    assert query(SOURCE, password, f"""
      SELECT has_function_privilege('sentinela_local_admin','{FUNCTION}','EXECUTE')
      AND NOT has_function_privilege('sentinela_local_operator','{FUNCTION}','EXECUTE')
      AND NOT has_function_privilege('sentinela_local_analyst','{FUNCTION}','EXECUTE')
      AND (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
           AND relkind='r' AND relrowsecurity AND relforcerowsecurity)=19;
    """) == "t"
    assert query(SOURCE, password, FINGERPRINTS).splitlines() == read_json(root / "fingerprints.json")
    print(json.dumps({"activated": True, "port": SOURCE, "dataUnchanged": True, "verifiedArchive": snapshot["sha256"]}))


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--qualify", type=Path, metavar="CSV")
    action.add_argument("--activate", metavar="CLONE")
    options = parser.parse_args()
    if options.qualify:
        qualify(options.qualify.resolve(strict=True))
    else:
        activate(existing_root(options.activate))
