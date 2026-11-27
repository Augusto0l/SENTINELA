"""Qualify the February CSV against a restored, attested clone."""

import argparse
from importlib import import_module
import json
import os
from pathlib import Path
import secrets
import subprocess

import operational_clone as clones
from pilot_recovery import scram


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clone", help="identificador do clone privado já restaurado ou 'novo'")
    parser.add_argument("data_project", type=Path, help="diretório SENTINELA-DADOS")
    parser.add_argument("--browser", action="store_true", help="validar as APIs e o Edge após o piloto SQL")
    args = parser.parse_args()
    if args.clone == "novo":
        if args.browser:
            parser.error("--browser requer um clone já homologado")
        qualification = import_module("qualify-original-natures-activation")
        root = clones.private_root()
        print(f"Clone: {root.name}", flush=True)
        meta = clones.source_snapshot(root)
        clones.restore(root, meta, clones.CLONE, normalize_schema=qualification.lot_policy_schema)
    else:
        root = clones.existing_root(args.clone)
    meta = read_json(root / "backup.json")
    identity = read_json(root / "identity-55487.json")
    password = clones.secret(root, "admin-55487.dpapi")
    port = clones.CLONE
    target = clones.attest_clone(root, port, password, identity["uuid"], meta["origin"])
    assert target["system"] == identity["system"]
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith(("PG", "SENTINELA_", "SUPABASE", "NEXT_PUBLIC_SUPABASE"))}
    env["SENTINELA_CATALOG_CLONE_ROOT"] = str(root)
    if args.browser:
        assert (root / "pcdf-history-result.json").is_file(), "execute primeiro a homologação SQL"
        # Fresh credentials are confined to disposable logins in the attested clone.
        for role in clones.ROLES:
            credential = secrets.token_hex(32)
            clones.query(port, password, f"ALTER ROLE {role} PASSWORD '{scram(credential)}';")
            env["SENTINELA_PCDF_LOCAL_PASSWORD_" + role] = credential
        command = ["node", "scripts/check-pcdf-catalog-activation.mjs", "--historical"]
    else:
        assert not (root / "pcdf-history-result.json").exists(), "clone já homologado para esta competência"
        env["SENTINELA_PG_REVIEW_CLONE"] = password
        restricted = args.data_project / "dados_restritos"
        csv = restricted / "pcdf-v2-csvs-2021-2026" / "pcdf_naturezas_2021-02.csv"
        manifest = restricted / "pcdf-v2-integral-2021-2026" / "2021-02" / "manifesto.json"
        command = ["node", "--experimental-strip-types", "scripts/check-pcdf-history.mjs", str(csv), str(manifest)]
    subprocess.run(command, cwd=Path(__file__).resolve().parents[3], env=env, check=True)

    clones.configure_controller()
    origin_manifests = [path for path in clones.BASE.glob("rls-sandbox-*/manifest.json")
                        if read_json(path).get("pcdf_purpose") == "operacional"]
    assert len(origin_manifests) == 1
    source = clones.control.load(origin_manifests[0])
    source_password = clones.secret(Path(source["root"]), "admin.dpapi")
    origin = json.loads(clones.query(clones.SOURCE, source_password, clones.PROPERTY))
    assert (origin["uuid"], origin["system"], origin["readonly"]) == (meta["origin"]["uuid"], meta["origin"]["system"], "on")
    original = read_json(root / "fingerprints.json")
    fingerprints = "BEGIN READ ONLY;\n" + clones.FINGERPRINTS + "\nROLLBACK;"
    assert clones.query(clones.SOURCE, source_password, fingerprints).splitlines() == original
    after = clones.query(port, password, fingerprints).splitlines()
    pre_by_table = {line.split("|")[0]: line for line in original}
    after_by_table = {line.split("|")[0]: line for line in after}
    assert pre_by_table.keys() == after_by_table.keys()
    differences = {table for table in pre_by_table if pre_by_table[table] != after_by_table[table]}
    assert differences == {
        "sentinela.eventos_auditoria", "sentinela.execucoes_importacao", "sentinela.extracoes_origem",
        "sentinela.linhas_origem", "sentinela.linhas_staging", "sentinela.lotes_importacao",
        "sentinela.ocorrencia_naturezas", "sentinela.ocorrencias", "sentinela.pendencias_revisao",
    }
    print(f"Origem em leitura: {len(original)} tabelas com hashes preservados. Clone: {len(differences)} tabelas do piloto.", flush=True)


if __name__ == "__main__":
    main()
