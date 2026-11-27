"""Verify the prepared catalog activation and independent recovery in private clones."""
from argparse import ArgumentParser
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import secrets
import subprocess
from uuid import UUID

import operational_clone as clones
from pilot_recovery import scram

REPO = Path(__file__).resolve().parents[3]
RELEASE = REPO / "database/release"
LOT = "84908630-bd04-4a03-923d-616649c8de74"
STAGED = 6393
REMAINING = 20321
CATALOG_VERSION = "local-pcdf-naturezas-0001"
OPERATIONAL_ARTIFACT = RELEASE / "pcdf-original-natures-operational.psql"
REVISION = "634f7f20897453028d0551c68d26778e69a7a772bdf2485fad39ba2ffff3600b"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


# Shared with the default backup/restore procedure in operational_clone.py.
lot_policy_schema = clones.lot_policy_schema


def verify_restore(root, meta, port, password, marker):
    identity = clones.attest_clone(root, port, password, marker, meta["origin"])
    verify = lambda sql: clones.query(port, password, sql)
    assert clones.digest(root / "origem.dump") == meta["sha256"]
    assert all(clones.digest(root / name) == digest for name, digest in meta["sidecars"].items())
    assert lot_policy_schema(clones.fingerprint_schema(port, password)) == lot_policy_schema(read_json(root / "schema.json"))
    assert verify("BEGIN READ ONLY;\n" + clones.FINGERPRINTS + "\nROLLBACK;").splitlines() == read_json(root / "fingerprints.json")
    for role in clones.ROLES:
        assert verify(f"SET SESSION AUTHORIZATION {role}; BEGIN READ ONLY; "
                      "SELECT sentinela_ocorrencias_local.identidade()->>'login'=session_user; ROLLBACK;") == "t"
    return identity


def qualify_operational(root, before, meta, password, fingerprints, catalog, administrator, cohort):
    port = before["port"]
    artifact = OPERATIONAL_ARTIFACT.read_bytes()
    sql = artifact.decode("utf-8")
    clone = (RELEASE / "pcdf-original-natures-clone.psql").read_text(encoding="utf-8")
    body = clone[clone.index("CREATE TEMP TABLE descricoes_pcdf"):].rstrip().removesuffix("COMMIT;")
    annex = (RELEASE / "pcdf-original-natures-reprocess.sql").read_text(encoding="utf-8").strip()
    assert (body + "\n" + annex) in sql and sql.count("\nCOMMIT;") == 1

    # The production bytes must deny the clone. For execution, adapt exactly the three target markers.
    adapted = sql
    for old, new in (("IS DISTINCT FROM 55484", f"IS DISTINCT FROM {port}"),
                     (meta["origin"]["uuid"], before["uuid"]), (meta["origin"]["system"], before["system"])):
        assert adapted.count(old) == 1 and old != new
        adapted = adapted.replace(old, new, 1)

    def apply(statement, **overrides):
        now = datetime.now(timezone(timedelta(hours=-3)))
        args = {"lote": LOT, "revisao": REVISION, "responsavel": administrator, "aprovacao": "ensaio-clone",
                "naturezas": json.dumps(catalog), "pendencias_sha": cohort, "backup_sha": meta["sha256"],
                "fingerprints": json.dumps(fingerprints),
                "janela_inicio": (now - timedelta(minutes=1)).isoformat(timespec="seconds"),
                "janela_fim": (now + timedelta(minutes=2)).isoformat(timespec="seconds")}
        args.update(overrides)
        variables = [item for key, value in args.items() for item in ("-v", f"{key}={value}")]
        return clones.pg("psql", "-X", "-qAt", *clones.address(port), *variables, "-f", "-", password=password,
                         input=statement)

    def reject(statement, reason, **overrides):
        try:
            apply(statement, **overrides)
        except subprocess.CalledProcessError as error:
            if reason not in error.stderr:
                raise AssertionError(f"Recusa inesperada ({reason}): {error.stderr}") from None
        else:
            raise AssertionError(f"A recusa esperada não ocorreu ({reason})")

    def query(statement):
        return clones.query(port, password, statement)

    reject(sql, "Destino operacional ou executor divergente")
    reject(adapted, "Escritas operacionais precisam estar bloqueadas")
    writers = clones.ROLES[:2]
    assert query("SELECT count(*) FROM pg_roles WHERE rolcanlogin AND rolname IN " + str(writers) + ";") == "2"
    query("BEGIN; " + " ".join(f"ALTER ROLE {role} NOLOGIN;" for role in writers) + " COMMIT;")
    try:
        assert query("SET SESSION AUTHORIZATION sentinela_local_analyst; BEGIN READ ONLY; "
                     "SELECT sentinela_ocorrencias_local.resumo()->>'consolidadas'; COMMIT;") == "0"
        reject(adapted, "fora do hor", janela_fim="2000-01-01T00:00:00-03:00")
        reject(adapted, "de lote, aprova", revisao="0" * 64)
        reject(adapted, "operacional diverge do backup", fingerprints="[]")
        reject(adapted, "Conjunto exato de pend", pendencias_sha="0" * 64)
        verify_restore(root, meta, port, password, before["uuid"])
        assert query("SELECT to_regprocedure('sentinela.descricao_pcdf(text)') IS NULL;") == "t"
        apply(adapted)
    finally:
        query("BEGIN; " + " ".join(f"ALTER ROLE {role} LOGIN;" for role in writers) + " COMMIT;")
    return {"operationalArtifactSha256": sha256(artifact).hexdigest(), "productionTargetRejectedClone": True,
            "writerFenceTested": True, "expiredWindowRejected": True, "wrongRevisionRejected": True,
            "wrongBackupFingerprintsRejected": True}


def qualify(root, operational=False):
    port = clones.CLONE
    meta = read_json(root / "backup.json")
    password = clones.secret(root, f"admin-{port}.dpapi")
    marker = str(UUID(clones.query(port, password, "SHOW sentinela.sandbox_uuid;")))
    before = verify_restore(root, meta, port, password, marker)
    print("Backup atual restaurado no clone, com 27 tabelas e os três perfis conferidos.", flush=True)
    (root / f"identity-{port}.json").write_text(json.dumps(before, indent=2), encoding="utf-8")
    try:
        verify = lambda sql: clones.query(port, password, sql)
        administrator = verify("SELECT id FROM sentinela.usuarios WHERE ativo AND perfil='Administrador' ORDER BY id LIMIT 1;")
        administrator = str(UUID(administrator))
        cohort = verify(f"""
            SELECT encode(sha256(convert_to(string_agg(p.id::text,',' ORDER BY p.id),'UTF8')),'hex')
            FROM sentinela.pendencias_revisao p
            WHERE p.tipo='classificacao' AND p.campo='classificacao_status' AND p.regra='classificacao_pendente'
              AND p.status='aberta' AND p.efeito='bloqueia_consolidacao'
              AND EXISTS(SELECT FROM sentinela.linhas_staging s WHERE s.lote_id='{LOT}' AND s.linha_origem_id=p.linha_origem_id);
        """)
        assert len(cohort) == 64
        catalog = read_json(REPO / "docs/catalogos/pcdf-naturezas-xml-v1.json")["naturezas"]
        migration = (RELEASE / "pcdf-original-natures-clone.psql").read_text(encoding="utf-8")
        audit = (RELEASE / "pcdf-original-natures-reprocess.sql").read_text(encoding="utf-8")
        assert migration.endswith("COMMIT;\n") and migration.count("\nCOMMIT;") == 1
        # Uses the same lock as the PCDF receivers and lot management.
        marker_sql = "SET LOCAL lock_timeout='5s';"
        migration = migration.replace(marker_sql, marker_sql +
            "\nSELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));", 1)
        def apply(digest):
            return clones.pg("psql", "-X", "-qAt", *clones.address(port), "-v", "ON_ERROR_STOP=1",
                             "-v", "expected_uuid=" + marker, "-v", "expected_system=" + before["system"],
                             "-v", "naturezas=" + json.dumps(catalog), "-v", "lote=" + LOT,
                             "-v", "responsavel=" + administrator, "-v", "aprovacao=ensaio-clone",
                             "-v", "pendencias_sha=" + digest, "-f", "-", password=password,
                             input=migration.removesuffix("COMMIT;\n") + audit + "\nCOMMIT;")
        before_hashes = read_json(root / "fingerprints.json")
        if operational:
            artifact_report = qualify_operational(root, before, meta, password, before_hashes, catalog, administrator, cohort)
        else:
            try:
                apply("0" * 64)
            except subprocess.CalledProcessError as error:
                assert "Conjunto exato de pend" in error.stderr
            else:
                raise AssertionError("A migração aceitou uma assinatura de pendências incorreta")
            verify_restore(root, meta, port, password, marker)
            apply(cohort)
            artifact_report = {}
        after = verify("BEGIN READ ONLY;\n" + clones.FINGERPRINTS + "\nROLLBACK;").splitlines()
        changed = [old.split("|")[0] for old, new in zip(before_hashes, after, strict=True) if old != new]
        assert set(changed) == {"sentinela.naturezas_criminais", "sentinela.schema_migrations", "sentinela.eventos_auditoria"}
        assert int(verify("SELECT count(*) FROM sentinela.naturezas_criminais;")) == 41
        assert int(verify("SELECT count(*) FROM sentinela.pendencias_revisao;")) == STAGED + REMAINING
        assert verify(f"""SELECT count(*)=1 FROM sentinela.eventos_auditoria
           WHERE acao='catalogo.pcdf.pendencias_reavaliadas' AND transacao_id IS NOT NULL
           AND jsonb_array_length(depois->'pendencias')={STAGED} AND depois->>'sha256Pendencias'='{cohort}';""") == "t"
        audit_count = int(verify("SELECT count(*) FROM sentinela.eventos_auditoria;"))
        assert audit_count == int(next(row.split("|")[1] for row in before_hashes if row.startswith("sentinela.eventos_auditoria|"))) + 1
        assert verify("""SELECT count(*)=19 FROM pg_class WHERE relnamespace='sentinela'::regnamespace
           AND relkind='r' AND relrowsecurity AND relforcerowsecurity;""") == "t"
        for role in clones.ROLES:
            data = json.loads(verify(f"SET SESSION AUTHORIZATION {role}; SELECT sentinela_ocorrencias_local.resumo();"))
            assert data["consolidadas"] == 0
            assert (data["recebidas"], data["pendencias"]) == (
                (None, None) if role == clones.ROLES[-1] else (STAGED, REMAINING))
        for role in clones.ROLES:
            assert verify(f"""SELECT NOT has_table_privilege('{role}', 'sentinela.linhas_staging','SELECT')
                AND NOT has_table_privilege('{role}', 'sentinela.pendencias_revisao','UPDATE')
                AND NOT has_table_privilege('{role}', 'sentinela.eventos_auditoria','INSERT,UPDATE,DELETE');""") == "t"
        credentials = {role: secrets.token_hex(32) for role in clones.ROLES}
        for role, credential in credentials.items():
            verify(f"ALTER ROLE {role} PASSWORD '{scram(credential)}';")
        env = {k: v for k, v in os.environ.items() if not k.upper().startswith(("PG", "SENTINELA_", "SUPABASE", "NEXT_PUBLIC_SUPABASE"))}
        env["SENTINELA_CATALOG_CLONE_ROOT"] = str(root)
        env.update({"SENTINELA_PCDF_LOCAL_PASSWORD_" + role: value for role, value in credentials.items()})
        subprocess.run(["node", "scripts/check-pcdf-catalog-activation.mjs"], cwd=REPO, env=env, check=True)
        report = {"backup": meta["sha256"], "tables": meta["tables"], "clone": root.name,
                  "cohort": cohort, "changed": changed, "staging": STAGED, "physicalIssues": STAGED + REMAINING,
                  "visibleIssues": REMAINING, "audit": audit_count, "rollbackWrongDigest": True, **artifact_report}
        (root / "catalog-activation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report), flush=True)
    finally:
        clones.stop_clone(root, port, password, marker, meta["origin"])

    # Use the same backup on another listener, with original authentication and ACL sidecars.
    raw_fingerprint = clones.fingerprint_schema
    def fingerprint_recovery(port, password, options=()):
        actual = raw_fingerprint(port, password, options)
        if port != clones.RECOVERY:
            return actual
        expected = read_json(root / "schema.json")
        assert lot_policy_schema(actual[:]) == lot_policy_schema(expected[:])
        return expected
    clones.fingerprint_schema = fingerprint_recovery
    identity, recovery_password = clones.restore(root, meta, clones.RECOVERY)
    try:
        assert clones.query(clones.RECOVERY, recovery_password,
           "SELECT to_regprocedure('sentinela.descricao_pcdf(text)') IS NULL;") == "t"
        report["independentRecovery"] = True
        (root / "catalog-activation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("Recuperação independente conferida na porta 55489.", flush=True)
    finally:
        clones.stop_clone(root, clones.RECOVERY, recovery_password, identity["uuid"], meta["origin"])


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("clone")
    parser.add_argument("--operational", action="store_true", help="Qualificar o artefato com destino operacional fixo")
    args = parser.parse_args()
    qualify(clones.existing_root(args.clone), args.operational)
