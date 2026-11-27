"""Render the three approved installation files, without connecting to any database."""

import argparse
from datetime import datetime, timedelta
from hashlib import sha256
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent
EXPECTED = (
    (9, "0009_importador_papeis_ambiente.sql", "2526f4af732fe954f3db35ec4c0ed2d781d6e2b8a2c4d79283c07b49dfdd09da"),
    (10, "0010_importador_objetos.sql", "a27df66e1d86714bae11cc1a17088deee2b327e5ea58df604279328507c84bfe"),
    (11, "0011_central_revisao_hospedada.sql", "86adff9252824f66ba5d711d1735ec5fba645ab0430b635dc099266f4cd74cd4"),
)

GUARD = """DO $target$
BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'postgres'
     OR current_setting('server_version_num') <> '170011' OR pg_is_in_recovery()
     OR extensions.postgis_lib_version() <> '3.3.7'
     OR NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'postgis' AND extversion = '3.3.7'
                    AND extnamespace = 'extensions'::regnamespace) THEN
    RAISE EXCEPTION 'Instalador, banco ou versões divergem do pré-voo institucional.';
  END IF;
END
$target$;
"""


def render_files(start):
    checks = (ROOT / "tests/check_institutional_installation.sql").read_text(encoding="utf8")
    latest_version = "20261126163836"
    files = []
    for phase, filename, approved_hash in EXPECTED:
        raw = (ROOT / "migrations" / filename).read_bytes()
        if sha256(raw).hexdigest() != approved_hash:
            raise ValueError(f"Approved SHA-256 mismatch: {filename}")
        text = raw.decode("utf8").replace("\r\n", "\n")
        if not text.rstrip().endswith("\nCOMMIT;"):
            raise ValueError(f"Expected terminal COMMIT in {filename}")
        body, boundaries = re.subn(r"(?m)^(?:BEGIN|COMMIT);$", "", text)
        if boundaries != 2 or "$sentinela_deployment_body$" in body:
            raise ValueError(f"Unexpected transaction structure in {filename}")

        version = start.strftime("%Y%m%d%H%M%S")
        if version <= latest_version:
            raise ValueError("Deployment versions must follow the verified managed history")
        name = Path(filename).stem
        history = f"""
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('{version}', '{name}', ARRAY[$sentinela_deployment_body${body}$sentinela_deployment_body$]);
"""
        output = (
            f"-- Target ref: hcmqsqfbrynpfjvmuqdb. Attest TLS endpoint and release the recovery gate before executing.\n"
            f"-- SHA-256 of {filename}: {approved_hash}\n"
            "\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL search_path = pg_catalog, pg_temp;\n"
            "SET LOCAL lock_timeout = '5s';\n"
            f"{GUARD}\\set sentinela_phase {phase - 1}\n{checks}\n{body}\n{history}\n"
            f"\\set sentinela_phase {phase}\n{checks}\nCOMMIT;\n"
        )
        files.append((f"{version}_{name}.sql", output))
        latest_version = version
        start += timedelta(seconds=1)
    return files


def render_transfer_prefix(start):
    phases = []
    for name, sql in render_files(start):
        lines = sql.splitlines(keepends=True)
        if lines.count("BEGIN;\n") != 1 or lines.count("COMMIT;\n") != 1 or lines[-1] != "COMMIT;\n":
            raise ValueError(f"Unexpected wrappers in {name}")
        lines.remove("BEGIN;\n")
        lines.pop()
        phases.append("".join(lines))
    # 0010 changes these settings. Restore the session defaults before the next phase and the load.
    reset = (
        "SET LOCAL check_function_bodies = DEFAULT;\n"
        "SET LOCAL default_tablespace = DEFAULT;\n"
        "SET LOCAL default_table_access_method = DEFAULT;\n"
    )
    return (
        "\\set ON_ERROR_STOP on\nBEGIN;\n"
        + reset.join(phases)
        + reset
        + "-- The verified operational load must still run in this session. No COMMIT is generated.\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--first-version-utc", required=True, help="UTC timestamp YYYYMMDDhhmmss")
    parser.add_argument("--output-dir", required=True, type=Path, help="New directory for the three SQL files")
    parser.add_argument("--transfer-prefix", action="store_true", help="Render one transaction prefix for the load, without a commit")
    args = parser.parse_args()
    try:
        start = datetime.strptime(args.first_version_utc, "%Y%m%d%H%M%S")
        if start.strftime("%Y%m%d%H%M%S") != args.first_version_utc:
            raise ValueError("Use a full 14-digit UTC timestamp")
        files = [("operational-transfer-prefix.sql", render_transfer_prefix(start))] if args.transfer_prefix else render_files(start)
        args.output_dir.mkdir(exist_ok=False)
        for name, output in files:
            with (args.output_dir / name).open("x", encoding="utf8", newline="\n") as handle:
                handle.write(output)
            print(name)
    except (OSError, ValueError) as error:
        parser.exit(2, f"{error}\n")


if __name__ == "__main__":
    main()
