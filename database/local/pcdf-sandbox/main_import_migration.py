"""Apply the qualified general intake and PCDF history extension to the attested local cluster."""
from hashlib import sha256

from direct_runtime import HERE, control

SHARED = HERE.parent / "write-sandbox/005_general_import.sql"
HISTORY = HERE / "main-import-history.sql"

MAPPING = """
CREATE SCHEMA sentinela_general_accounts;
REVOKE ALL ON SCHEMA sentinela_general_accounts FROM PUBLIC;

CREATE TABLE sentinela_general_accounts.individuals (
 login name PRIMARY KEY,
 subject uuid NOT NULL UNIQUE REFERENCES sentinela.usuarios(id)
);
INSERT INTO sentinela_general_accounts.individuals VALUES
 ('sentinela_local_admin','7d5a25df-d61a-43ae-9f09-7be430855aad'),
 ('sentinela_local_operator','6ca6f86c-56da-4af8-8249-3291fb263c52');
ALTER TABLE sentinela_general_accounts.individuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_general_accounts.individuals FORCE ROW LEVEL SECURITY;
"""

CHECK = """SELECT coalesce((
  SELECT version FROM sentinela_import_local.local_revision
),'');"""


def render():
    source = SHARED.read_text(encoding="utf8")
    start = source.index("CREATE ROLE sentinela_general_importer")
    body = source[start:]
    # Keep the already qualified intake, reconciliation, history and detail functions.
    # The lab-only review and corrections use other application routes.
    before, tail = body.split("CREATE TABLE sentinela_import_lab.decisions (", 1)
    _, tail = tail.split("CREATE FUNCTION sentinela_import_lab.check_actor", 1)
    body = before + "CREATE FUNCTION sentinela_import_lab.check_actor" + tail
    before, tail = body.split("CREATE FUNCTION sentinela_import_lab.review", 1)
    _, tail = tail.split("ALTER FUNCTION sentinela_import_lab.check_actor", 1)
    tail = "ALTER FUNCTION sentinela_import_lab.check_actor" + tail
    restricted = "\n".join(line for line in tail.splitlines()
                           if not line.startswith(("ALTER FUNCTION sentinela_import_lab.review",
                                                   "ALTER FUNCTION sentinela_import_lab.decide")))
    restricted = restricted.split("GRANT EXECUTE ON FUNCTION sentinela_import_lab.review", 1)[0]
    body = (before + restricted).replace("sentinela_import_lab", "sentinela_import_local")
    for old, new in (("sentinela_write_lab", "sentinela_general_accounts"), ("sentinela_sbx_admin", "sentinela_local_admin"),
                     ("sentinela_sbx_operator", "sentinela_local_operator"), (", sentinela_sbx_analyst", "")):
        body = body.replace(old, new)
    control.require("sentinela_sbx" not in body and "sentinela_write_lab" not in body
                    and body.rstrip().endswith("TO sentinela_local_admin,sentinela_local_operator;"),
                    "Unexpected shared intake interface")
    return MAPPING + body + "\n" + HISTORY.read_text(encoding="utf8")


def apply(cluster, admin, runner, commands):
    control.attest(cluster, admin, run=runner)
    sql = render()
    version = sha256(sql.encode()).hexdigest()
    exists = control.psql(cluster, admin, run=runner, sql="""
        SELECT to_regclass('sentinela_import_local.local_revision') IS NOT NULL;""")
    if exists == "t":
        control.require(control.psql(cluster, admin, run=runner, sql=CHECK) == version, "Local import migration revision differs")
        return
    transaction = f"""BEGIN;
    {sql}
    CREATE TABLE sentinela_import_local.local_revision (version text PRIMARY KEY);
    INSERT INTO sentinela_import_local.local_revision VALUES ('{version}');
    ALTER TABLE sentinela_import_local.local_revision ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sentinela_import_local.local_revision FORCE ROW LEVEL SECURITY;
    COMMIT;"""
    def install(exe, args, password=None):
        return commands.call(exe, args, password=password, input=transaction)
    control.psql(cluster, admin, file="-", run=install)
    control.require(control.psql(cluster, admin, run=runner, sql=CHECK) == version, "Migration receipt absent")
