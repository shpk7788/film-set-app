#!/bin/sh
# Recreates a local test database: Supabase stand-in + schema + a setup secret.
DB=${1:-fs3}
su postgres -c "psql -q -d postgres -c \"select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB' and pid <> pg_backend_pid()\" >/dev/null; dropdb --if-exists $DB && createdb $DB && psql -q -v ON_ERROR_STOP=1 -d $DB -f $(pwd)/supabase-shim.sql && psql -q -v ON_ERROR_STOP=1 -d $DB -f $(pwd)/../supabase/schema.sql && psql -q -d $DB -c \"insert into setup_secret values ('test-setup-secret-1234')\"" 2>&1 | grep -v NOTICE || true
