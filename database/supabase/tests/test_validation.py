"""Negative tests for drift and model/security changes; uses no PostgreSQL."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import baseline


class DriftTests(unittest.TestCase):
    def test_frozen_artifact_passes(self):
        baseline.check()

    def check_tamper(self, change):
        changed = change(baseline.TARGET.read_text(encoding="utf-8"))
        saved = json.loads(baseline.MANIFEST.read_text())
        with patch.object(baseline, "TARGET") as target:
            target.read_text.return_value = changed
            with patch.object(baseline, "manifest", return_value=saved):
                with self.assertRaisesRegex(ValueError, "artifact differs"):
                    baseline.check()

    def test_missing_foreign_key_is_rejected(self):
        self.check_tamper(lambda sql: sql.replace(" REFERENCES sentinela.perfis(nome)", "", 1))

    def test_missing_force_rls_is_rejected(self):
        self.check_tamper(lambda sql: sql.replace("FORCE ROW LEVEL SECURITY", "NO FORCE ROW LEVEL SECURITY"))

    def test_public_spatial_reference_is_rejected(self):
        self.check_tamper(lambda sql: sql.replace("extensions.geometry", "public.geometry", 1))

    def test_permissive_policy_is_rejected(self):
        self.check_tamper(lambda sql: sql.replace("COMMIT;", "CREATE POLICY leak ON sentinela.usuarios USING (true);\nCOMMIT;"))

    def test_extension_reinstall_is_rejected(self):
        self.check_tamper(lambda sql: sql.replace("COMMIT;", "CREATE EXTENSION postgis;\nCOMMIT;"))

    def test_checksum_drift_is_rejected(self):
        data = json.loads(baseline.MANIFEST.read_text())
        first = next(iter(data["sources"]))
        data["sources"][first] = "0" * 64
        with patch.object(baseline, "MANIFEST") as manifest:
            manifest.read_text.return_value = json.dumps(data)
            with self.assertRaisesRegex(ValueError, "drift"):
                baseline.check()

    def test_generator_refuses_overwrite(self):
        with patch.object(sys, "argv", ["baseline.py", "--write"]):
            with self.assertRaisesRegex(SystemExit, "already exists"):
                baseline.main()


if __name__ == "__main__":
    unittest.main()
