"""Launcher regressions. No operational PostgreSQL, credentials or migrations."""

import ctypes
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import local_dev as dev
import local_dev_postgres as pg


spec = importlib.util.spec_from_file_location("launcher", Path(__file__).with_name("serve-import-3000.py"))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class WindowsProcessTests(unittest.TestCase):
    def test_invalid_pid_never_reaches_open_process(self):
        with patch.object(dev, "windows_api") as api:
            for pid in (0, -1, 2**32, True, "42"):
                with self.subTest(pid=pid), self.assertRaisesRegex(dev.control.Refused, "PID inválido"):
                    dev.windows_process(pid)
        api.assert_not_called()

    def test_missing_pid_and_access_denied_are_distinct(self):
        kernel = Mock()
        kernel.OpenProcess.return_value = None
        with patch.object(dev, "windows_api", return_value=kernel), patch.object(
            ctypes, "get_last_error", create=True, side_effect=(87, 5)
        ):
            self.assertIsNone(dev.windows_process(17376))
            with self.assertRaisesRegex(dev.StartupError, r"OpenProcess \(PID 17376\).*winerror=5"):
                dev.windows_process(17376)
        kernel.CloseHandle.assert_not_called()

    @unittest.skipUnless(os.name == "nt", "Windows process handles")
    def test_process_that_exited_is_not_reported_as_live(self):
        with subprocess.Popen([sys.executable, "-B", "-c", "pass"]) as child:
            child.wait(timeout=10)
            self.assertIsNone(dev.windows_process(child.pid))


class PortTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "Windows netstat and bind")
    def test_port_reports_real_foreign_listener_with_pid_and_executable(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            with self.assertRaisesRegex(dev.StartupError, rf"porta {port}.*PID {os.getpid()} \(python[^)]*\)"):
                dev.check_http_port(f"http://localhost:{port}", "a" * 64)
            self.assertEqual(listener.getsockname()[1], port)
        self.assertFalse(dev.check_http_port(f"http://localhost:{port}", "a" * 64))

    def test_node_listener_requires_matching_application_probe(self):
        process = dev.Process(Path("node.exe"), 1000)
        with patch.object(dev, "free_http"), patch.object(dev, "listeners", return_value={"127.0.0.1:3000": 42}), \
             patch.object(dev, "windows_process", return_value=process), \
             patch.object(dev, "responds_as_sentinela", side_effect=(False, True)) as http:
            with self.assertRaisesRegex(dev.StartupError, r"porta 3000.*PID 42 \(node.exe\)"):
                dev.check_http_port(launcher.ORIGIN, "a" * 64)
            self.assertTrue(dev.check_http_port(launcher.ORIGIN, "a" * 64))
        http.assert_called_with(3000, "a" * 64)

    def test_ipv6_listener_is_reported_even_when_ipv4_bind_succeeds(self):
        with patch.object(dev, "free_http"), patch.object(dev, "listeners", return_value={"[::1]:3000": 42}), \
             patch.object(dev, "windows_process", return_value=dev.Process(Path("python.exe"), 1000)):
            with self.assertRaisesRegex(dev.StartupError, r"\[::1\]:3000.*PID 42"):
                dev.check_http_port(launcher.ORIGIN, "a" * 64)

    def test_listener_that_exits_during_discovery_releases_the_port(self):
        with patch.object(dev, "free_http"), \
             patch.object(dev, "listeners", side_effect=({"127.0.0.1:3000": 42}, {})), \
             patch.object(dev, "windows_process", return_value=None):
            self.assertFalse(dev.check_http_port(launcher.ORIGIN, "a" * 64))


class PostgresTests(unittest.TestCase):
    def test_stale_running_cluster_keeps_residual_file_until_postgres_handles_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            data.mkdir()
            (data / "pg_tblspc").mkdir()
            cluster = dict(kind="fixture", uuid="test", system_id="123", database="test", port=pg.control.PORT,
                           phase="RUNNING", pid=17376, start_epoch=1000, root=str(root), data=str(data),
                           runtime_files={"postgresql.conf": "fixture"})
            marker = data / "sentinela-sandbox.json"
            marker.write_text(json.dumps(cluster), encoding="utf-8")
            pid_file = data / "postmaster.pid"
            before = f"17376\n{data}\n1000\n{pg.control.PORT}\n"
            pid_file.write_text(before, encoding="utf-8")

            def pg_ctl(tool, arguments):
                self.assertEqual(tool, "pg_ctl")
                self.assertEqual(arguments[-4:], ["-t", "120", "-w", "start"])
                self.assertEqual(pid_file.read_text(encoding="utf-8"), before)

            with patch.object(pg, "windows_process", return_value=None), \
                 patch.multiple(pg.control, free_port=Mock(return_value=True), artifacts=Mock(),
                                control_id=Mock(return_value="123"), digest=Mock(return_value="fixture"),
                                attest=Mock(return_value=(404, 2000)), save=Mock()):
                self.assertTrue(pg.ensure_postgres(cluster, "admin", pg_ctl))
                pg.control.attest.assert_called_once()
                pg.control.save.assert_called_once()
            self.assertEqual((cluster["pid"], cluster["start_epoch"]), (404, 2000))

    def test_clean_shutdown_with_stale_manifest_uses_normal_start(self):
        cluster = dict(phase="RUNNING", pid=42, start_epoch=1000, port=55484)
        runner = Mock()
        with patch.object(pg, "read_postmaster", return_value=None), patch.object(pg, "windows_process", return_value=None), \
             patch.object(pg.control, "free_port", return_value=True), patch.object(pg.control, "start") as start:
            self.assertTrue(pg.ensure_postgres(cluster, "admin", runner))
        start.assert_called_once_with(cluster, "admin", run=runner, process_check=pg.verify_postgres_process)
        self.assertEqual(cluster, dict(phase="STOPPED", pid=None, start_epoch=None, port=55484))

    def test_reused_pids_distinguish_unrelated_process_and_other_postgres(self):
        with patch.object(pg, "windows_process", side_effect=(
            dev.Process(Path("node.exe"), 2000), dev.Process(pg.control.BIN / "postgres.exe", 2000)
        )):
            self.assertFalse(pg.postmaster_is_live((42, 1000)))
            with self.assertRaisesRegex(dev.control.Refused, "identidade divergente"):
                pg.postmaster_is_live((42, 1000))

    def test_next_only_never_restarts_missing_postgres(self):
        cluster = dict(phase="RUNNING", pid=42, start_epoch=1000, port=55484)
        with patch.object(pg, "read_postmaster", return_value=(42, 1000)), \
             patch.object(pg, "windows_process", return_value=None), patch.object(pg.control, "start") as start:
            with self.assertRaisesRegex(pg.control.Refused, "sem processo ativo"):
                pg.ensure_postgres(cluster, "admin", Mock(), next_only=True)
        start.assert_not_called()


class LauncherTests(unittest.TestCase):
    def test_operational_launch_uses_supabase_with_the_local_database(self):
        cluster = {"uuid": "fixture", "system_id": "123", "start_epoch": 1000, "port": 55484}
        credentials = {role: "fixture" for role in launcher.ROLES}
        with patch.object(launcher.subprocess, "run", return_value=Mock(returncode=0)) as next_process:
            self.assertEqual(launcher.run_next(cluster, credentials), 0)
        env = next_process.call_args.kwargs["env"]
        self.assertEqual(env["SENTINELA_AUTH_PROVIDER"], "supabase")
        self.assertEqual(env["SENTINELA_INTEGRATED_SUPABASE"], "1")
        self.assertEqual(env["SENTINELA_LOCAL_DEMO"], "0")
        self.assertEqual(env["SENTINELA_LOCAL_ACCOUNTS_FILE"], "")
        self.assertEqual(env["SENTINELA_OPERATIONAL_IMPORT_MANAGEMENT"], "1")
        self.assertEqual(env["SENTINELA_PCDF_LOCAL_ID"], cluster["uuid"])
        self.assertEqual(env["SENTINELA_PCDF_LOCAL_SYSTEM_ID"], cluster["system_id"])
        self.assertEqual(env["SENTINELA_PCDF_LOCAL_START"], str(cluster["start_epoch"]))
        self.assertNotIn("NEXT_PUBLIC_SUPABASE_URL", env)
        self.assertNotIn("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", env)

    def test_operational_marker_rejects_the_previous_launcher_marker(self):
        cluster = {"uuid": "fixture", "start_epoch": 1000}
        previous = f"{str(launcher.control.REPO).casefold()}\n{cluster['uuid']}\n{cluster['start_epoch']}"
        self.assertNotEqual(launcher.instance_marker(cluster), sha256(previous.encode("utf-8")).hexdigest())

    def test_existing_instance_skips_credentials_and_next(self):
        with patch.object(launcher, "existing_instance", return_value=True), patch.object(launcher, "secret") as secret, \
             patch.object(launcher, "run_next") as next_process:
            self.assertEqual(launcher.serve({}, SimpleNamespace(migrate_only=False, next_only=False)), 0)
        secret.assert_not_called()
        next_process.assert_not_called()

    def test_normal_launch_keeps_readonly_preflights_and_stops_only_owned_server(self):
        args = SimpleNamespace(migrate_only=False, next_only=False)
        cluster = {"root": ".", "uuid": "fixture", "start_epoch": 1000}
        for started_here in (True, False):
            with self.subTest(started_here=started_here), patch.object(launcher, "existing_instance", return_value=False), \
                 patch.object(launcher, "secret", return_value="fixture"), \
                 patch.object(launcher, "ensure_postgres", return_value=started_here) as ensure, \
                 patch.object(launcher, "technical_check") as attest, \
                 patch.object(launcher, "profile_query", return_value="t") as query, \
                 patch.object(launcher, "run_next", return_value=0) as next_process, \
                 patch.object(launcher.control, "stop") as stop:
                self.assertEqual(launcher.serve(cluster, args), 0)
                ensure.assert_called_once()
                attest.assert_called_once()
                self.assertEqual(query.call_count, 5)
                self.assertTrue(all("BEGIN READ ONLY;" in call.args[4] for call in query.call_args_list))
                next_process.assert_called_once()
                self.assertEqual(stop.call_count, int(started_here))


if __name__ == "__main__":
    unittest.main()
