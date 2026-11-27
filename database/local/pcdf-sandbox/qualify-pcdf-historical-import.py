"""Install and exercise the historical CSV receiver only in an attested clone."""

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import secrets
import subprocess

import operational_clone as clones
from pilot_recovery import scram


def browser(root, password, identity, env, csv_dir, synthetic):
    def query(statement):
        return clones.query(clones.CLONE, password, statement)

    previous = json.loads(query("""SELECT jsonb_build_object('release', (SELECT to_jsonb(r) FROM sentinela_gestao_autorizacao.release r),
      'actor', (SELECT to_jsonb(a) FROM sentinela_gestao_autorizacao.atores a),
      'roles', (SELECT jsonb_object_agg(rolname,rolpassword) FROM pg_authid WHERE rolname IN
         ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst')))"""))
    release, actor, roles = previous["release"], previous["actor"], previous["roles"]
    account = sha256(b'["sentinela-local","Administrador","historico-0@example.test"]').hexdigest()
    assert len(roles) == 3 and set(roles) == set(clones.ROLES)
    try:
        if synthetic:
            assert query("SELECT count(*) FROM sentinela.lotes_importacao;") == "1", "use um clone descartável contendo só janeiro"
            synthetic_file = root / "pcdf_naturezas_2021-03.csv"
            completed = subprocess.run(["node", "--experimental-strip-types", "scripts/prepare-pcdf-historical-fixture.mjs",
                                        str(synthetic_file)], env=env, check=True, capture_output=True, text=True)
            metadata = json.loads(completed.stdout)
            assert metadata["hash"] == clones.digest(synthetic_file) and metadata["bytes"] == synthetic_file.stat().st_size
            query(f"""UPDATE sentinela_pcdf_historico.arquivos SET sha256='{metadata["hash"]}',
              bytes={metadata["bytes"]},linhas=2,candidatas=1 WHERE competencia='2021-03-01';""")
            env["SENTINELA_HISTORY_SYNTHETIC_FILE"] = str(synthetic_file)
        for role in clones.ROLES:
            credential = secrets.token_hex(32)
            query(f"ALTER ROLE {role} PASSWORD '{scram(credential)}';")
            env["SENTINELA_PCDF_LOCAL_PASSWORD_" + role] = credential
        query(f"""UPDATE sentinela_gestao_autorizacao.atores SET conta='{account}',validade=clock_timestamp()+interval '1 hour';
          UPDATE sentinela_gestao_autorizacao.release SET cluster_uuid='{identity["uuid"]}',system_id='{identity["system"]}',porta=55487,aberta=true;""")
        env["SENTINELA_HISTORY_FIXTURE_SUBJECT"] = actor["usuario"]
        subprocess.run(["node", "scripts/check-pcdf-historical-browser.mjs", str(csv_dir)], env=env, check=True)
    finally:
        for role in clones.ROLES:
            credential = roles[role]
            assert credential is None or (credential.startswith("SCRAM-SHA-256$") and "'" not in credential)
            query(f"ALTER ROLE {role} PASSWORD " + (f"'{credential}'" if credential else "NULL") + ";")
        query(f"""UPDATE sentinela_gestao_autorizacao.atores SET conta='{actor["conta"]}',validade='{actor["validade"]}';
          UPDATE sentinela_gestao_autorizacao.release SET cluster_uuid='{release["cluster_uuid"]}',
            system_id='{release["system_id"]}',porta={release["porta"]},aberta={str(release["aberta"]).lower()};""")


def main():
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clone")
    parser.add_argument("csv_dir", type=Path)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--all", action="store_true")
    modes.add_argument("--partial", action="store_true", help="ensaiar apenas julho e agosto de 2026 após o piloto")
    modes.add_argument("--browser", action="store_true")
    modes.add_argument("--synthetic", action="store_true", help="testar a gravação via Edge num clone descartável com janeiro")
    args = parser.parse_args()
    root = clones.existing_root(args.clone)
    identity = json.loads((root / "identity-55487.json").read_text(encoding="utf-8"))
    meta = json.loads((root / "backup.json").read_text(encoding="utf-8"))
    password = clones.secret(root, "admin-55487.dpapi")
    target = clones.attest_clone(root, clones.CLONE, password, identity["uuid"], meta["origin"])
    assert target["system"] == identity["system"]
    if clones.query(clones.CLONE, password, "SELECT to_regnamespace('sentinela_pcdf_historico') IS NULL") == "t":
        try:
            print(clones.pg("psql", "-X", "-qAt", *clones.address(clones.CLONE),
                            "-v", f"cluster_uuid={identity['uuid']}", "-v", f"system_id={identity['system']}",
                            "-v", "port=55487", "-f", "database/release/pcdf-historical-import.psql",
                            password=password), flush=True)
        except subprocess.CalledProcessError as failure:
            raise RuntimeError(failure.stderr) from failure
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith(("PG", "SENTINELA_", "SUPABASE", "NEXT_PUBLIC_SUPABASE"))}
    env["SENTINELA_CATALOG_CLONE_ROOT"] = str(root)
    if args.browser or args.synthetic:
        browser(root, password, identity, env, args.csv_dir.resolve(), args.synthetic)
        return
    env["SENTINELA_PG_REVIEW_CLONE"] = password
    option = ["--all"] if args.all else ["--partial"] if args.partial else []
    subprocess.run(["node", "--experimental-strip-types", "scripts/check-pcdf-historical-import.mjs",
                    str(args.csv_dir.resolve()), *option], env=env, check=True)


if __name__ == "__main__":
    main()
