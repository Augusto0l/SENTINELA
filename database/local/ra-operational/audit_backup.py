"""Compare a qualified pre-RA backup against one authorized read-only snapshot."""
import argparse
import json
import os
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backup"))
import recover as backup

BASE_LEDGER = ["0001", "0002", "0003", "0004", "0005", "local-read-0001"]
INVENTORY = """SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,t.relname,t.relkind)
 ORDER BY n.nspname,t.relname),'[]') FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
 AND t.relkind IN ('r','p','f','m','S')
 AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass
 AND d.objid=t.oid AND d.deptype='e')"""
GLOBALS = """SELECT jsonb_build_object(
 'catalog_total',(SELECT count(*) FROM sentinela.regioes_administrativas),
 'distinct_codes',(SELECT count(DISTINCT codigo_interno) FROM sentinela.regioes_administrativas),
 'duplicate_code_groups',(SELECT count(*) FROM (SELECT codigo_interno FROM sentinela.regioes_administrativas
 GROUP BY codigo_interno HAVING count(*)>1) s),
 'ledger',(SELECT jsonb_agg(versao ORDER BY versao COLLATE "C") FROM sentinela.schema_migrations))"""


def verified_json(path, expected):
    import hashlib
    payload = path.read_bytes()
    backup.require(re.fullmatch(r"[0-9a-f]{64}", expected) and hashlib.sha256(payload).hexdigest() == expected,
                   "Reviewed fingerprint required")
    return json.loads(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("report_sha256")
    parser.add_argument("metadata_sha256")
    parser.add_argument("data_sha256")
    parser.add_argument("--authorized-read", choices=["postgres"])
    args = parser.parse_args()
    report = {"result": "FAIL", "stage": "artifacts"}
    session = None
    try:
        root = args.directory.resolve(strict=True)
        receipt = verified_json(root / "report.json", args.report_sha256)
        metadata = verified_json(root / "source-metadata.json", args.metadata_sha256)
        data = verified_json(root / "source-data-hashes.json", args.data_sha256)
        backup.check_source(receipt["source"], "postgres")
        backup.require(receipt["result"] == "PASS" and receipt["source_state_preserved"] is True
                       and receipt["sandbox_final"] == "STOPPED" and receipt["restore"]["structural_differences"] == []
                       and receipt["restore"]["table_data_hashes_equal"] is True
                       and receipt["backup"]["consistent_exported_snapshot"] is True,
                       "Qualified backup required")
        backup.require(backup.digest(root / "database.dump") == receipt["backup"]["sha256"], "Archive hash mismatch")
        backup.require(sorted(data) == sorted(backup.TABLES) and data["regioes_administrativas"]["count"] == 0
                       and receipt["global_checks"]["ledger"] == BASE_LEDGER, "Unexpected snapshot")
        report.update(result="ARTIFACTS_VERIFIED", tables=len(data))
        if args.authorized_read:
            report.update(result="FAIL", stage="read-only-inventory")
            commands = backup.Commands(os.environ.pop("SENTINELA_LOCAL_BACKUP_PASSWORD", None))
            session = backup.ReadSession(args.authorized_read, commands)
            identity = session.query(backup.IDENTITY)
            backup.check_source(identity, args.authorized_read)
            inventory = session.query(INVENTORY)
            current_metadata, current_data = session.query(backup.metadata_sql()), session.query(backup.data_sql())
            globals_now = session.query(GLOBALS)
            schema_differences = sorted(key for key in set(metadata) | set(current_metadata)
                                        if metadata.get(key) != current_metadata.get(key))
            data_differences = sorted(key for key in set(data) | set(current_data) if data.get(key) != current_data.get(key))
            matches = not schema_differences and not data_differences and inventory == receipt["inventory"]
            baseline = globals_now == {"catalog_total": 0, "distinct_codes": 0, "duplicate_code_groups": 0,
                                       "ledger": BASE_LEDGER}
            report.update(result="PASS" if matches and baseline else "DRIFT",
                          postgres=identity["version"], postgis=identity["postgis"],
                          tables=len(current_data), schemaDifferences=schema_differences,
                          dataDifferences=data_differences, inventoryMatches=inventory == receipt["inventory"],
                          globalChecks=globals_now)
    except (Exception, KeyboardInterrupt) as error:
        report.update(result="FAIL", error=type(error).__name__)
    finally:
        if session:
            try:
                session.close()
            except (Exception, KeyboardInterrupt):
                report.update(result="FAIL", stage="close")
        print(json.dumps(report), flush=True)
    return int(report["result"] not in {"PASS", "ARTIFACTS_VERIFIED"})


if __name__ == "__main__":
    sys.exit(main())
