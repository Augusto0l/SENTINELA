"""Access to the newest disposable operational clone (127.0.0.1:55487). Refuses any other port."""
import os
import sys
from pathlib import Path

SANDBOX = Path(__file__).resolve().parents[1] / "pcdf-sandbox"
sys.path.insert(0, str(SANDBOX))
os.chdir(SANDBOX)  # the sandbox helpers resolve their own relative paths

import operational_clone as oc  # noqa: E402
from direct_runtime import secret  # noqa: E402

assert oc.CLONE == 55487 and oc.SOURCE == 55484


def clone_root():
    roots = sorted(oc.ROOT.glob("clone-*"), key=lambda path: path.stat().st_mtime)
    if not roots:
        raise SystemExit("Nenhum clone descartável encontrado. Execute operational_clone.py.")
    return roots[-1]


def query(sql, role="postgres"):
    """Run SQL as the clone superuser (technical executor). Every script guards the port itself."""
    root = clone_root()
    password = secret(root, f"admin-{oc.CLONE}.dpapi")
    guard = ("DO $g$ BEGIN IF inet_server_port() <> 55487 OR current_setting('sentinela.sandbox_uuid', true) IS NULL "
             "THEN RAISE EXCEPTION 'Somente o clone descartavel 55487.'; END IF; END $g$;\n")
    return oc.query(oc.CLONE, password, guard + sql, role=role)
