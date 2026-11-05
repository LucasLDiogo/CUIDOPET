#!/usr/bin/env bash
# Valida migration + seed + testes de RLS num PostgreSQL puro (15+), sem `supabase start`.
# Uso: DB_URL=postgres://postgres@localhost/postgres supabase/tests/run-psql.sh
# Cria (e apaga no fim) o banco temporário cuidope_test.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ADMIN_URL="${DB_URL:-postgres://postgres@localhost/postgres}"
TEST_DB="${TEST_DB:-cuidope_test}"

psql "$ADMIN_URL" -q -c "drop database if exists $TEST_DB" -c "create database $TEST_DB"
TEST_URL="${ADMIN_URL%/*}/$TEST_DB"
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 \
  -f "$HERE/00_stubs_supabase.sql" \
  -f "$ROOT/migrations/20261104000100_cuidope_marketplace.sql" \
  -f "$ROOT/seed.sql" >/dev/null
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -t -A -f "$HERE/10_rls_e_regras.sql" | grep -E "verificações OK|^ok" | tail -n 1
[ "${KEEP_DB:-0}" = "1" ] || psql "$ADMIN_URL" -q -c "drop database $TEST_DB"
