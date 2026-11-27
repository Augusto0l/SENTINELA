"""Qualify manual registration using an empty synthetic cluster on 55486 only."""
from hashlib import sha256
import json
from pathlib import Path
import re
import secrets
import subprocess
from uuid import uuid4

import direct_runtime as runtime
from direct_runtime import backup, control, ROLES
from main_import_migration import apply as apply_import
from manual_activation import activation_sql
from manual_catalog_seed import nature_rows, seed_sql, territory_rows


def qualify():
    runtime.PORT = runtime.QUALIFICATION_PORT = 55486
    runtime.configure_controller()
    password = secrets.token_hex(32)
    roles = {role: secrets.token_hex(32) for role in ROLES}
    commands = backup.Commands()
    runner = backup.bootstrap_runner(commands, password)
    cluster = runtime.new_cluster("sintetico", password, runner)

    def psql(sql, expected=True, login="postgres", database_password=password, *, sqlstate=None):
        assert cluster["port"] == 55486 and cluster["pcdf_purpose"] == "sintetico"
        args = ["-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", "55486", "-U", login,
                "-d", "sentinela_pcdf_local", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate",
                "-v", "expected_uuid=" + cluster["uuid"], "-v", "expected_system=" + cluster["system_id"]]
        if sqlstate:
            assert not expected
            result = subprocess.run([str(control.BIN / "psql.exe"), *args, "-f", "-"], input=sql,
                                    env=backup.clean_env(database_password, False), capture_output=True,
                                    encoding="utf8", errors="replace", timeout=180)
            match = re.search(r"(?m)(?:ERROR|ERRO):\s+([A-Z0-9]{5})\b", result.stderr)
            assert result.returncode and match and match[1] == sqlstate, (
                sqlstate, match[1] if match else None, backup.diagnostic(result.stderr),
                re.search(r"(?m)^psql:<stdin>:(\d+):", result.stderr).group(1) if "psql:<stdin>:" in result.stderr else None)
            return None
        try:
            result = commands.call("psql", args, password=database_password, input=sql)
        except RuntimeError:
            if expected:
                raise
            return None
        assert expected
        return result.strip()

    try:
        runtime.provision(cluster, password, runner, commands, roles)
        print("PostgreSQL sintético provisionado na porta 55486.", flush=True)
        apply_import(cluster, password, runner, commands)
        psql((runtime.HERE / "occurrences-read.sql").read_text(encoding="utf8"))
        catalog = "SELECT sentinela_ocorrencias_manual.catalogo"
        territories = territory_rows()

        fixtures = dict(versao="ensaio-1", fonte="SENTINELA-NATUREZAS-SINTETICAS", evidencia="Fixture 55486", registros=[
            dict(codigo=f"TESTE-{letter}", descricao=f"Natureza sintética {letter}",
                 situacao="homologada", usoManual=True) for letter in "AB"])
        manifest = Path(cluster["root"]) / "evidence" / "naturezas-sinteticas.json"
        content = json.dumps(fixtures).encode()
        manifest.write_bytes(content)
        digest = sha256(content).hexdigest()
        nature = nature_rows(manifest, digest)
        assert "inet_server_port() NOT IN (55486)" in seed_sql(nature, "natureza")
        duplicate = content.replace(b"{", b'{"versao":"ambigua",', 1)
        manifest.write_bytes(duplicate)
        try:
            nature_rows(manifest, sha256(duplicate).hexdigest())
        except ValueError as error:
            assert "Chave JSON repetida" in str(error)
        else:
            raise AssertionError("O catálogo aceitou chaves repetidas com hash válido")
        manifest.write_bytes(content)
        try:
            activation_sql(manifest, digest)
        except ValueError:
            pass
        else:
            raise AssertionError("O gerador operacional aceitou o manifesto sintético")
        bundle = activation_sql(manifest, digest, synthetic=True)
        body, _, _ = bundle.rpartition("\nCOMMIT;")
        psql(body + "\nSELECT 1/0;\nCOMMIT;", False, sqlstate="22012")
        assert psql("""SELECT to_regnamespace('sentinela_ocorrencias_manual') IS NULL
          AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname IN ('sentinela_manual_reader','sentinela_manual_writer'))
          AND NOT EXISTS(SELECT FROM sentinela.schema_migrations WHERE versao LIKE 'local-manual-%')
          AND NOT EXISTS(SELECT FROM sentinela.regioes_administrativas)
          AND NOT EXISTS(SELECT FROM sentinela.naturezas_criminais);""") == "t"
        psql(bundle)
        psql(bundle, False, sqlstate="P0001")
        psql(seed_sql(territories, "ra"))
        psql(seed_sql(nature, "natureza", synthetic_only=True))
        bad_release = [dict(row, nome="Nome alterado") if index == 0 else row
                       for index, row in enumerate(territories)]
        psql(seed_sql(bad_release, "ra"), False, sqlstate="P0001")
        assert psql("SELECT count(*) FROM sentinela.regioes_administrativas WHERE codigo_oficial IS NULL "
                    "AND extensions.ST_IsValid(limite) AND extensions.ST_SRID(limite)=4326;") == str(len(territories))
        for changes in (dict(codigo="téste-a"), dict(descricao="NATUREZA SINTETICA A"), dict(situacao="pendente")):
            invalid = dict(fixtures, registros=[fixtures["registros"][0], {**fixtures["registros"][1], **changes}])
            content = json.dumps(invalid).encode()
            manifest.write_bytes(content)
            try:
                nature_rows(manifest, sha256(content).hexdigest())
            except ValueError:
                pass
            else:
                raise AssertionError(f"Manifesto inválido aceito: {changes}")
        psql("""INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original,codigo_manual) VALUES
          ('31000000-0000-4000-8000-000000000003','PCDF','Natureza externa ao cadastro manual',NULL),
          ('31000000-0000-4000-8000-000000000004','SENTINELA_MANUAL','Natureza sem homologação','SEM-ATO');""")
        for login in ROLES[:2]:
            visible = json.loads(psql(catalog + "(null::text);", True, login, roles[login]))
            expected_ra = sorted((r["codigo"], r["nome"], r["id"], r["referencia"]["administrativeNumber"])
                                 for r in territories)
            assert sorted((r["codigo"], r["nome"], r["id"], r["numeroAdministrativo"])
                          for r in visible["regioes"]) == expected_ra
            assert [n["codigo"] for n in visible["naturezas"]] == ["TESTE-A", "TESTE-B"]
            assert [r["codigo"] for r in json.loads(psql(catalog + "('AGUA QUENTE');", True, login,
                                                        roles[login]))["regioes"]] == ["RA-XXXV"]
            assert [r["codigo"] for r in json.loads(psql(catalog + "('XXXVII');", True, login,
                                                        roles[login]))["regioes"]] == ["XXXVII"]
            assert [n["codigo"] for n in json.loads(psql(catalog + "('SINTETICA B');", True, login,
                                                        roles[login]))["naturezas"]] == ["TESTE-B"]
            assert [n["codigo"] for n in json.loads(psql(catalog + "('teste-a');", True, login,
                                                        roles[login]))["naturezas"]] == ["TESTE-A"]
        analyst = ROLES[2]
        assert psql(catalog + "(null::text);", False, analyst, roles[analyst]) is None
        failure_key = str(uuid4())
        psql(f"""ALTER TABLE sentinela.eventos_auditoria ADD CONSTRAINT teste_manual_falha_tardia
          CHECK (request_id IS DISTINCT FROM '{failure_key}') NOT VALID;""")
        unconfirmed = dict(data="2025-08-06", horario="11:23:00", endereco="Ensaio SQL", bairroOuSetor="Setor",
                           raId=territories[0]["id"], coordenadas=dict(latitude=-15.7942, longitude=-47.8825),
                           localizacaoConfirmada=False, naturezas=[dict(naturezaId=nature[0]["id"], crimeTentado=None)])
        psql(f"SELECT sentinela_ocorrencias_manual.cadastrar($test${json.dumps(unconfirmed)}$test$::jsonb,"
             f"'{uuid4()}','{'0' * 64}');", False, ROLES[0], roles[ROLES[0]], sqlstate="22023")
        # Qualify the activation bundle on its original listener. The integrated HTTP
        # flow is exercised on 55488 by qualify-management.py --browser.
        payload = {**unconfirmed, "localizacaoConfirmada": True, "cep": "70070010",
                   "naturezas": [{"naturezaId": item["id"], "crimeTentado": index == 0}
                                 for index, item in enumerate(nature)]}
        def command(key):
            return ("SELECT sentinela_ocorrencias_manual.cadastrar("
                    f"$test${json.dumps(payload)}$test$::jsonb, '{key}', '{'0' * 64}');")
        psql(command(failure_key), False, ROLES[0], roles[ROLES[0]], sqlstate="23514")
        for login in ROLES[:2]:
            key = str(uuid4())
            receipt = psql(command(key), True, login, roles[login])
            assert psql(command(key), True, login, roles[login]) == receipt
        def integrity():
            return psql("""SELECT jsonb_build_object(
              'manual',(SELECT count(*) FROM sentinela.ocorrencias WHERE origem='manual' AND consolidacao_status='em_revisao'
                AND extensions.ST_SRID(geometria)=4326 AND extensions.ST_X(geometria)=longitude AND extensions.ST_Y(geometria)=latitude),
              'associacoes',(SELECT count(*) FROM sentinela.ocorrencia_naturezas),
              'auditados',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='ocorrencia.manual.criada'
                AND length(depois->>'contaLocal')=64 AND depois->'localizacaoConfirmada'='true'::jsonb),
              'recibos',(SELECT count(*) FROM sentinela_ocorrencias_manual.cadastros),
              'consolidadas',(SELECT count(*) FROM sentinela.ocorrencias WHERE consolidacao_status='consolidada'),
              'staging',(SELECT count(*) FROM sentinela.linhas_staging));""")
        counts = json.loads(integrity())
        assert counts == dict(manual=2, associacoes=4, auditados=2, recibos=2, consolidadas=0, staging=0), counts
        for login in ROLES:
            assert psql("SELECT id FROM sentinela.ocorrencias;", False, login, roles[login]) is None
            assert psql("SELECT id FROM sentinela.naturezas_criminais;", False, login, roles[login]) is None
            assert psql("SELECT id FROM sentinela.regioes_administrativas;", False, login, roles[login]) is None
            psql("SELECT ocorrencia_id FROM sentinela_ocorrencias_manual.cadastros;", False, login, roles[login], sqlstate="42501")
            psql("INSERT INTO sentinela.ocorrencias DEFAULT VALUES;", False, login, roles[login], sqlstate="42501")
        assert psql("SELECT sentinela_ocorrencias_manual.cadastrar('{}',null,null);", False, analyst, roles[analyst]) is None
        control.stop(cluster, password, run=runner)
        control.start(cluster, password, run=runner)
        assert json.loads(integrity()) == counts
        assert json.loads(psql(catalog + "(null::text);", True, ROLES[1], roles[ROLES[1]])) == visible
        print(json.dumps({"resultado": "APROVADO", "postgresql": counts, "regioes": len(territories),
                          "naturezas_sinteticas": len(nature), "recuperacao_apos_reinicio": True}), flush=True)
    except Exception:
        for event in commands.events:
            if event.get("exit_code"):
                print({key: value for key, value in event.items() if key in ("exe", "exit_code", "sqlstate")}, flush=True)
        raise
    finally:
        if cluster["phase"] in {"RUNNING", "INSTALLED"}:
            control.stop(cluster, password, run=runner)


if __name__ == "__main__":
    qualify()
