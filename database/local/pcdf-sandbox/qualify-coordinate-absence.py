"""Exercise the versioned coordinate-absence projection on an attested private clone."""
from argparse import ArgumentParser
from importlib import import_module
import json
import os
import secrets
import subprocess

import operational_clone as clones
from pilot_recovery import scram


qualification = import_module("qualify-original-natures-activation")
ARTIFACT = qualification.RELEASE / "pcdf-coordinate-absence-clone.psql"
COHORT = "410fc2a72c5e439a2798494dfa4bf0ae5d1a1c89023693d3777ec9086de51a0a"


def qualify(root, compare_visual=False):
    data = qualification.read_json
    port = clones.CLONE
    meta = data(root / "backup.json")
    identity = data(root / f"identity-{port}.json")
    marker = identity["uuid"]
    password = clones.secret(root, f"admin-{port}.dpapi")
    identity = qualification.verify_restore(root, meta, port, password, marker)
    (root / f"identity-{port}.json").write_text(json.dumps(identity, indent=2), encoding="utf-8")
    before = data(root / "fingerprints.json")

    def query(sql):
        return clones.query(port, password, sql)

    def fingerprint():
        return query("BEGIN READ ONLY;\n" + clones.FINGERPRINTS + "\nROLLBACK;").splitlines()

    def apply(digest):
        return clones.pg("psql", "-X", "-qAt", *clones.address(port), "-v", "expected_uuid=" + marker,
                         "-v", "expected_system=" + identity["system"], "-v", "expected_cohort=" + digest,
                         "-f", ARTIFACT, password=password)

    try:
        env = {k: v for k, v in os.environ.items() if not k.upper().startswith(("PG", "SENTINELA_", "SUPABASE", "NEXT_PUBLIC_SUPABASE"))}
        env["SENTINELA_CATALOG_CLONE_ROOT"] = str(root)
        for role in clones.ROLES:
            credential = secrets.token_hex(32)
            query(f"ALTER ROLE {role} PASSWORD '{scram(credential)}';")
            env["SENTINELA_PCDF_LOCAL_PASSWORD_" + role] = credential

        def browser(mode):
            subprocess.run(["node", "scripts/check-pcdf-catalog-activation.mjs", mode], cwd=qualification.REPO,
                           env=env, check=True)

        if compare_visual:
            browser("--coordinate-baseline")

        try:
            apply("0" * 64)
        except subprocess.CalledProcessError as error:
            assert "Assinatura da coorte" in error.stderr, error.stderr
        else:
            raise AssertionError("A homologação aceitou um SHA-256 inválido.")
        qualification.verify_restore(root, meta, port, password, marker)

        apply(COHORT)
        after = fingerprint()
        changed = {old.split("|")[0] for old, new in zip(before, after, strict=True) if old != new}
        assert changed == {"sentinela.schema_migrations", "sentinela.eventos_auditoria"}
        apply(COHORT)
        assert fingerprint() == after
        assert query(f"""SELECT count(*)=1 FROM sentinela.eventos_auditoria
          WHERE acao='pcdf.coordenadas.ausencias_informativas' AND transacao_id IS NOT NULL
          AND jsonb_array_length(depois->'pendencias')=12230 AND depois->>'sha256Pendencias'='{COHORT}';""") == "t"
        assert query("""SELECT count(*)=19 FROM pg_class WHERE relnamespace='sentinela'::regnamespace
          AND relkind='r' AND relrowsecurity AND relforcerowsecurity;""") == "t"
        for role in clones.ROLES:
            summary = json.loads(query(f"SET SESSION AUTHORIZATION {role}; SELECT sentinela_ocorrencias_local.resumo();"))
            assert summary["consolidadas"] == 0
            assert (summary["recebidas"], summary["pendencias"]) == ((None, None) if role == clones.ROLES[-1] else (6393, 8091))
            assert query(f"""SELECT NOT has_table_privilege('{role}','sentinela.linhas_staging','SELECT')
              AND NOT has_table_privilege('{role}','sentinela.pendencias_revisao','UPDATE')
              AND NOT has_table_privilege('{role}','sentinela.eventos_auditoria','INSERT,UPDATE,DELETE');""") == "t"

        browser("--coordinate-absence")
        receipt = {"clone": root.name, "backupSha256": meta["sha256"], "sqlSha256": clones.digest(ARTIFACT),
                   "cohortSha256": COHORT, "counts": [20321, 8091, 26714], "unchangedTables": 25,
                   "rollback": True, "idempotence": True, "httpProfiles": 3, "dashboard": True, "map": True}
        if compare_visual:
            receipt["identicalDashboardSnapshots"] = {width: clones.digest(root / f"catalogo-dashboard-{width}-antes.png") ==
                                                        clones.digest(root / f"catalogo-dashboard-{width}.png")
                                                        for width in (1440, 390)}
        (root / "coordinate-absence.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        print(json.dumps(receipt), flush=True)
    except subprocess.CalledProcessError as error:
        (root / "coordinate-absence-failure.log").write_text(error.stderr or "Falha no navegador", encoding="utf-8")
        raise SystemExit("Falha na homologação. Consulte o log privado.") from None
    finally:
        clones.stop_clone(root, port, password, marker, meta["origin"])


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("clone")
    parser.add_argument("--compare-visual", action="store_true", help="Capturar o Dashboard antes e depois")
    args = parser.parse_args()
    qualify(clones.existing_root(args.clone), args.compare_visual)
