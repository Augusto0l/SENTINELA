"""Render the reviewed PCDF statistical activation without connecting to PostgreSQL."""

from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path


RELEASE = Path(__file__).resolve().parent
ACTIVATION_VERSION = "local-pcdf-revisao-independente-0001"
ABSENCE_VERSION = "local-pcdf-coordenadas-ausencia-0001"
SOURCES = {
    "pcdf-original-natures-operational.psql": "bca256fa1bd3c0b1371a164f2fad5355ed7086500d0a6fa909507d59f4453245",
    "pcdf-coordinate-absence-clone.psql": "242f0e1ec9198e1f91bb765720bc6f9ba25b72d01509f4aa3a17452c5a6f5a2b",
    "pcdf-independent-review-clone.psql": "1afca987b75026b1f2b9ea261ca1ae356aa7a85e6a4546f31955e4bc084ac65c",
    "pcdf-independent-review-reader.sql": "4cf71bb31836ff3a9df9097bb75538e1491f29467570af535881394782494eef",
}


def reviewed_text(name):
    data = (RELEASE / name).read_bytes()
    canonical = data.replace(b"\r\n", b"\n")
    variants = (canonical, canonical.replace(b"\n", b"\r\n"))
    if all(sha256(value).hexdigest() != SOURCES[name] for value in variants):
        raise ValueError(f"Artefato revisado divergente: {name}")
    return canonical.decode("utf-8")


def sql_between(sql, start, end):
    begin = sql.index(start)
    return sql[begin:sql.index(end, begin)].rstrip()


def replace_once(sql, old, new):
    if sql.count(old) != 1:
        raise ValueError(f"Trecho esperado deve ocorrer uma vez: {old}")
    return sql.replace(old, new, 1)


def render(clone=False):
    catalog = reviewed_text("pcdf-original-natures-operational.psql")
    window = sql_between(catalog, "CREATE FUNCTION pg_temp.conferir_janela()", "\nSET LOCAL sentinela.catalogo_lote")
    locks = sql_between(catalog, "CREATE FUNCTION pg_temp.impressao()", "CREATE TEMP TABLE pcdf_antes")
    absence = sql_between(reviewed_text("pcdf-coordinate-absence-clone.psql"), "SELECT EXISTS(", "\nCOMMIT;")
    review = sql_between(reviewed_text("pcdf-independent-review-clone.psql"), "SELECT EXISTS(", "\nCOMMIT;")
    reader = reviewed_text("pcdf-independent-review-reader.sql")

    absence = absence.replace("clone-pcdf-coordenadas-ausencia-0001", ABSENCE_VERSION)
    absence = absence.replace("Projeção de ausências por componente PCDF em homologação",
                              "Projeção funcional de ausências por componente PCDF")
    absence = replace_once(absence, "'sha256Pendencias',assinatura,", "'sha256Pendencias',assinatura, "
                           "'aprovacao',current_setting('sentinela.ativacao_aprovacao'), "
                           "'responsavel',current_setting('sentinela.ativacao_responsavel'), "
                           "'backupSha256',current_setting('sentinela.ativacao_backup'),")

    review = review.replace("clone-pcdf-revisao-independente-0001", ACTIVATION_VERSION)
    review = review.replace("Homologação em clone. Tupla literal conciliada", "Tupla literal conciliada")
    review = replace_once(review, "'csvSha256',current_setting('sentinela.pcdf_review_sha'),",
                          "'csvSha256',current_setting('sentinela.pcdf_review_sha'), "
                          "'aprovacao',current_setting('sentinela.ativacao_aprovacao'), "
                          "'responsavel',current_setting('sentinela.ativacao_responsavel'), "
                          "'backupSha256',current_setting('sentinela.ativacao_backup'),")
    review = replace_once(review, r"\ir pcdf-independent-review-reader.sql", reader.rstrip())

    template = (RELEASE / "pcdf-statistical-activation.sql.in").read_text(encoding="utf-8")
    if clone:
        destination = """inet_server_port() IS DISTINCT FROM 55487
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.clone_uuid')
    OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.clone_system')
    OR nullif(current_setting('sentinela.clone_uuid'),'') IS NULL
    OR nullif(current_setting('sentinela.clone_system'),'') IS NULL
    OR current_setting('sentinela.clone_uuid')='c04244a6-bc8d-4491-98bc-9af8a268d30c'
    OR current_setting('sentinela.clone_system')='7710764288366362848'"""
        settings = "SET LOCAL sentinela.clone_uuid TO :'clone_uuid';\nSET LOCAL sentinela.clone_system TO :'clone_system';"
    else:
        destination = """inet_server_port() IS DISTINCT FROM 55484
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM 'c04244a6-bc8d-4491-98bc-9af8a268d30c'
    OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM '7710764288366362848'"""
        settings = ""
    for token, value in {
        "@DESTINATION_SETTINGS@": settings,
        "@DESTINATION@": destination,
        "@WINDOW@": window,
        "@LOCKS@": locks,
        "@ABSENCE@": absence,
        "@REVIEW@": review,
    }.items():
        template = replace_once(template, token, value)
    return template


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--clone", action="store_true", help="Fixar o destino na porta isolada 55487")
    args = parser.parse_args()
    rendered = render(args.clone).encode("utf-8")
    with args.output.open("xb") as output:
        output.write(rendered)
    print(sha256(rendered).hexdigest())
