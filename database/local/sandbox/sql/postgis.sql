\ir guard.sql
BEGIN;
CREATE SCHEMA extensions;
CREATE EXTENSION postgis WITH SCHEMA extensions VERSION '3.6.2';
COMMIT;
