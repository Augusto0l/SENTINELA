"""Homologate the independent PCDF review using an updated disposable restore."""
from argparse import ArgumentParser
from importlib import import_module
import json
import os
import secrets
import subprocess

import operational_clone as clones
from pilot_recovery import scram

qualification = import_module("qualify-original-natures-activation")
release = qualification.RELEASE
migration = release / "pcdf-independent-review-clone.psql"
csv_sha = "91fa79f88988d1540e81f438e0fb470cea07a0809ac60387577fbdf0be9d6a00"
cohort = "410fc2a72c5e439a2798494dfa4bf0ae5d1a1c89023693d3777ec9086de51a0a"


def qualify(root):
    port = clones.CLONE
    meta = qualification.read_json(root / "backup.json")
    password = clones.secret(root, f"admin-{port}.dpapi")
    marker = qualification.read_json(root / f"identity-{port}.json")["uuid"]
    target = qualification.verify_restore(root, meta, port, password, marker)
    (root / f"identity-{port}.json").write_text(json.dumps(target, indent=2), encoding="utf-8")

    def query(sql):
        return clones.query(port, password, sql)

    def apply(path, argument):
        return clones.pg("psql", "-X", "-qAt", *clones.address(port), "-v", f"expected_uuid={marker}",
                         "-v", f"expected_system={target['system']}", "-v", argument, "-f", path, password=password)

    def fingerprint():
        return query("BEGIN READ ONLY;\n" + clones.FINGERPRINTS + "\nROLLBACK;").splitlines()

    try:
        apply(release / "pcdf-coordinate-absence-clone.psql", f"expected_cohort={cohort}")
        before = fingerprint()
        before_schema = clones.fingerprint_schema(port, password)
        try:
            apply(migration, "expected_csv=" + "0" * 64)
        except subprocess.CalledProcessError as error:
            assert "Coorte, CSV ou revisao divergente" in error.stderr, error.stderr
        else:
            raise AssertionError("A migração aceitou um hash incorreto.")
        assert fingerprint() == before and clones.fingerprint_schema(port, password) == before_schema

        apply(migration, f"expected_csv={csv_sha}")
        query("ANALYZE sentinela.ocorrencias, sentinela.ocorrencia_naturezas, sentinela.linhas_origem, sentinela.naturezas_criminais;")
        after = fingerprint()
        changed = {old.split("|")[0] for old, new in zip(before,after,strict=True) if old != new}
        assert changed == {"sentinela.ocorrencias", "sentinela.ocorrencia_naturezas", "sentinela.eventos_auditoria", "sentinela.schema_migrations"}
        apply(migration, f"expected_csv={csv_sha}")
        assert fingerprint() == after

        evidence = json.loads(query("""
          SELECT jsonb_build_object(
           'recebidas',(SELECT count(*) FROM sentinela.linhas_staging),
           'consolidadas',(SELECT count(*) FROM sentinela.ocorrencias),
           'vinculos',(SELECT count(*) FROM sentinela.ocorrencia_naturezas),
           'multiplasNaturezas',(SELECT count(*) FROM (SELECT ocorrencia_id FROM sentinela.ocorrencia_naturezas
              GROUP BY ocorrencia_id HAVING count(DISTINCT natureza_id)>1) q),
           'naturezas',(SELECT count(*) FROM sentinela.naturezas_criminais),
           'historico',(SELECT count(*) FROM sentinela.pendencias_revisao),
           'pontos',(SELECT count(geometria) FROM sentinela.ocorrencias),
           'geoPendente',(SELECT count(*) FROM sentinela.ocorrencias WHERE localizacao_status='referencia_pendente'),
           'geoAusente',(SELECT count(*) FROM sentinela.ocorrencias WHERE localizacao_status='ausente'),
           'rls',(SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
                 AND relkind='r' AND relrowsecurity AND relforcerowsecurity),
           'auditoria',(SELECT id FROM sentinela.eventos_auditoria WHERE acao='pcdf.revisao_independente'
                 AND transacao_id IS NOT NULL),
           'origensSha256',(SELECT depois->>'sha256OrigensConsolidadas' FROM sentinela.eventos_auditoria
                 WHERE acao='pcdf.revisao_independente'));
        """))
        assert all(evidence[key] == count for key, count in {
            "recebidas": 6393, "consolidadas": 6090, "vinculos": 6392, "multiplasNaturezas": 293,
            "naturezas": 41, "historico": 26714, "pontos": 0, "rls": 19}.items())
        assert evidence["auditoria"] and evidence["origensSha256"]
        for index, role in enumerate(clones.ROLES):
            res = json.loads(query(f"SET SESSION AUTHORIZATION {role}; SELECT sentinela_ocorrencias_local.resumo();"))
            assert res["consolidadas"] == 6090
            assert res["pendencias"] == (None if index == 2 else 8091)
            assert query(f"""SELECT NOT has_table_privilege('{role}','sentinela.linhas_staging','SELECT')
              AND NOT has_function_privilege('{role}','sentinela_pcdf_revisao.ponto_geo(text,text,integer,text,extensions.geometry)','EXECUTE')
              AND NOT has_table_privilege('{role}','sentinela.eventos_auditoria','INSERT,UPDATE,DELETE');""") == "t"

        env = {key: value for key, value in os.environ.items() if not key.upper().startswith(("PG","SENTINELA_","SUPABASE","NEXT_PUBLIC_SUPABASE"))}
        env.update(SENTINELA_CATALOG_CLONE_ROOT=str(root), SENTINELA_PG_REVIEW_CLONE=password)
        for role in clones.ROLES:
            credential = secrets.token_hex(32)
            query(f"ALTER ROLE {role} PASSWORD '{scram(credential)}';")
            env["SENTINELA_PCDF_LOCAL_PASSWORD_" + role] = credential
        subprocess.run(["node","--experimental-strip-types","scripts/check-pcdf-independent-geo.mjs"], cwd=qualification.REPO, env=env, check=True)
        assert fingerprint() == after
        env.pop("SENTINELA_PG_REVIEW_CLONE")
        subprocess.run(["node","scripts/check-pcdf-catalog-activation.mjs","--independent-review"], cwd=qualification.REPO, env=env, check=True)
        receipt = {"clone": root.name, "backupSha256": meta["sha256"], "migrationSha256": clones.digest(migration),
                   "readerSha256": clones.digest(release / "pcdf-independent-review-reader.sql"),
                   "changedTables": sorted(changed), "rollback": True, "idempotent": True, "roleApis": 3, **evidence}
        (root / "independent-review.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        print(json.dumps(receipt), flush=True)
    finally:
        clones.stop_clone(root, port, password, marker, meta["origin"])


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("clone")
    qualify(clones.existing_root(parser.parse_args().clone))
