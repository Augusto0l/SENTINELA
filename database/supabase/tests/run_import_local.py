"""Install and verify the hosted importer in a fresh disposable local PostgreSQL 17 cluster.

Initialize that cluster with a superuser named bootstrap and a free loopback port.
Pass its data directory explicitly. Auth tables and functions are synthetic.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

AUTH_FIXTURE = """
CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE BYPASSRLS;
ALTER DATABASE postgres OWNER TO postgres;
CREATE SCHEMA extensions AUTHORIZATION postgres;
CREATE EXTENSION postgis WITH SCHEMA extensions;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
SET ROLE postgres;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_app_meta_data jsonb);
CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), not_after timestamptz);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt()->>'sub')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--data-directory", type=Path, required=True)
    parser.add_argument("--install-only", action="store_true", help="Provision a fresh cluster for browser testing")
    parser.add_argument("--before-importer", action="store_true", help="Pause at 0008 to seed an institutional fixture")
    parser.add_argument("--postgis-version", choices=("3.3.7", "3.6.2"), help="Require this PostGIS SQL and library version")
    args = parser.parse_args()
    if args.before_importer and not args.install_only:
        parser.error("--before-importer requires --install-only")
    if not 49152 <= args.port <= 65535 or args.port in (55484, 55487, 55491):
        parser.error("Specify a free high port reserved for this disposable cluster")
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env["PGCLIENTENCODING"] = "UTF8"

    def run(option, value, user="bootstrap"):
        return subprocess.run([args.psql, "-Xw", "-h", "127.0.0.1", "-p", str(args.port),
                               "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt",
                               option, str(value)], check=True, capture_output=True, encoding="utf8", env=env).stdout.strip()

    query = """SELECT json_build_array(current_user,inet_server_port(),current_setting('data_directory'),
      current_setting('server_version_num')::int/10000,pg_is_in_recovery(),
      (SELECT count(*) FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role') OR rolname LIKE 'sentinela%'),
      (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%'))"""
    user, port, directory, version, in_recovery, roles, schemas = json.loads(run("-c", query))
    if (user, port, version, in_recovery, roles, schemas) != ("bootstrap", args.port, 17, False, 0, 0) \
            or Path(directory).resolve() != args.data_directory.resolve():
        raise SystemExit("Disposable PostgreSQL cluster identity did not match")

    fixture = AUTH_FIXTURE
    if args.postgis_version:
        fixture = fixture.replace("WITH SCHEMA extensions;",
                                  f"WITH SCHEMA extensions VERSION '{args.postgis_version}';", 1)
    run("-c", fixture)
    if args.postgis_version:
        release = json.loads(run("-c", """SELECT jsonb_build_array(current_setting('server_version_num'),
            extensions.postgis_lib_version(),(SELECT extversion FROM pg_extension WHERE extname='postgis'))"""))
        if release != ["170011", args.postgis_version, args.postgis_version]:
            raise SystemExit("The actual PostgreSQL/PostGIS versions differ from the requested fixture")
    paths = [ROOT / "baseline" / "0001_modelo_inicial.sql", *sorted((ROOT / "migrations").glob("00*.sql"))]
    for path in paths:
        if args.before_importer and path.name[:4] > "0008":
            break
        run("-f", path, "postgres")
        print(f"OK {path.name}")
    if not args.install_only:
        run("-f", ROOT / "tests" / "import_security.sql")
        print("OK importer catalog, privileges, environment binding and synthetic Auth checks")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr) from error
