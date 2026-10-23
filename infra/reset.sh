#!/usr/bin/env bash
# Resets this demo stack to the seed bundle beside it: its database and
# uploaded files are dropped, the schema is migrated afresh, the bundle is
# loaded and the bootstrap admin created again — the stack afterwards holds the
# bundle and nothing else.
#
# Runs on the VM, in the stack's own directory (/srv/b2b/<stack>), where
# infra/seed.sh puts it beside the seeder, the bundle and seed.hash. seed.sh
# runs it after a deploy that changes what the stack would load, or when asked
# to (SEED_FORCE); it can also be run there by hand.
#
# Usage:
#   ./reset.sh               reset the stack
#   ./reset.sh --status      print "<state> <hash the last reset recorded, or ->"
#   ./reset.sh --simulation  restart the simulated back office on the build
#                            beside it, without a reset: its nights still
#                            count from the last one
#
# The shop shows its maintenance page meanwhile (FR-ADM-04) rather than going
# dark: the api is restarted with the flag on, keeps answering from it while
# the schema goes, and is restarted again on the new database. The web never
# restarts.
#
# A bundle with a simulation.json gets its simulated back office (ADR 0068)
# started once the reset is through, counting its nights from this reset; it
# is stopped before any reset, so it never writes into a half-dropped
# database. It keeps no state, so a new build of it needs no reset: seed.sh
# restarts it with --simulation, on the same night count.
#
# The guard: a database is reset only if a reset made it — a mark this script
# leaves on the schema — or if it holds nothing a shop would miss: no product,
# category or order, and no account but the bootstrap admin. A real shop's
# database never carries the mark, so a reset in the wrong place stops before
# anything is dropped. A stack that was filled some other way is reset by hand
# once (infra/README.md, "Seeding a demo stack").
set -euo pipefail
cd "$(dirname "$0")"

stack=$(basename "$PWD")
env_value() { sed -n "s/^$1=//p" .env | tail -n 1; }
domain=$(env_value APP_DOMAIN)
db_user=$(env_value POSTGRES_USER)
db_name=$(env_value POSTGRES_DB)
: "${domain:?APP_DOMAIN missing in .env}"
: "${db_user:?POSTGRES_USER missing in .env}"
: "${db_name:?POSTGRES_DB missing in .env}"

# The mark a reset leaves on the schema it creates. Followed by the hash of
# what it loaded once the seed has gone through, and by nothing until then, so
# a seed that fails is never taken for one that is done.
mark='b2b-catalog-platform: reset to a seed bundle'

# SQL on stdin, answers on stdout, unaligned and without headers.
sql() { docker compose exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -tA -U "$db_user" -d "$db_name"; }

status() {
  sql <<SQL
SELECT CASE
  WHEN obj_description('public'::regnamespace, 'pg_namespace') LIKE '$mark%' THEN 'reset-before'
  WHEN NOT EXISTS (SELECT 1 FROM products)
   AND NOT EXISTS (SELECT 1 FROM categories)
   AND NOT EXISTS (SELECT 1 FROM orders)
   AND (SELECT count(*) FROM users) <= 1 THEN 'empty'
  ELSE 'refused'
END || ' ' || coalesce(nullif(substr(obj_description('public'::regnamespace, 'pg_namespace'), length('$mark') + 2), ''), '-');
SQL
}

usage='usage: reset.sh [--status | --simulation]'
[ $# -le 1 ] || { echo "$usage" >&2; exit 2; }
case "${1:-}" in
  --status) status; exit 0 ;;
  '' | --simulation) ;;
  *) echo "$usage" >&2; exit 2 ;;
esac

# One reset at a time: two deploys, or a deploy and a hand, could otherwise
# meet.
exec 9>reset.lock
flock -n 9 || { echo "REFUSED: another reset of '$stack' is running" >&2; exit 1; }

# Starts the simulated back office, where the bundle describes one, on the
# build in erp-sim/app. `fresh` counts its nights from now; `keep` from the
# reset that wrote the epoch, or from now if none did.
start_simulation() {
  [ -f seed/simulation.json ] && [ -f erp-sim/app/main.cjs ] || return 0
  if [ -z "$(env_value ERP_SIM_TOKEN)" ]; then
    echo "WARNING: the bundle has a simulation.json, but .env has no ERP_SIM_TOKEN — the shop runs without its back office" >&2
    return 0
  fi
  if [ "$1" = fresh ] || [ ! -f erp-sim/epoch ]; then
    date -u +%Y-%m-%dT%H:%M:%SZ >erp-sim/epoch
  fi
  echo "==> Starting the simulated back office"
  docker compose --profile simulation up -d --no-deps --force-recreate erp-sim
}

if [ "${1:-}" = --simulation ]; then
  read -r state _ < <(status)
  if [ "$state" != reset-before ]; then
    echo "REFUSED: '$stack' was never reset to its bundle; its back office starts with a reset" >&2
    exit 1
  fi
  start_simulation keep
  exit 0
fi

loaded=$(cat seed.hash 2>/dev/null || true)
if [ ! -f seeder/main.cjs ] || [ ! -f seed/catalog.json ] || [ -z "$loaded" ]; then
  echo "FAILED: nothing to reset to — seed.sh has not put a seeder, a bundle and seed.hash here" >&2
  exit 1
fi

echo "==> Checking that '$stack' is a stack a seed may reset"
read -r state _ < <(status)
if [ "$state" = refused ]; then
  echo "REFUSED: '$stack' holds data no seed put there. reset.sh resets demo stacks only;" >&2
  echo "if this is one, reset its database by hand once (infra/README.md)." >&2
  exit 1
fi
echo "    $state, loading $loaded"

# Whatever this stack's bundle was, its back office stops first — removed, so
# a bundle that no longer has one does not keep an old one running.
docker compose --profile simulation rm --stop --force erp-sim
# Its nights belong to the database being dropped: a reset that fails below
# must not leave a count for --simulation to carry on.
rm -f erp-sim/epoch

# Waits until the api answers its maintenance endpoint with the given state.
# The endpoint is exempt from the gate, so it answers either way.
await_maintenance() {
  for _ in $(seq 1 36); do
    case "$(curl -s --max-time 10 "https://$domain/api/maintenance" 2>/dev/null)" in
      *"\"enabled\":$1"*) return 0 ;;
    esac
    sleep 5
  done
  echo "FAILED: https://$domain/api/maintenance never answered enabled:$1" >&2
  return 1
}

# The api caches the flag at boot and on a toggle, so writing it is not
# enough: the restart is what closes the shop. Nothing is dropped until the
# api says it is closed — a gate it had not picked up would open again the
# moment the new, unflagged schema appeared.
echo "==> Closing the shop for the reset (maintenance mode)"
sql >/dev/null <<SQL
INSERT INTO app_settings (id, "maintenanceMode") VALUES (1, true)
ON CONFLICT (id) DO UPDATE SET "maintenanceMode" = true;
SQL
docker compose restart api
await_maintenance true

# A new schema rather than emptied tables: the migrations write rows of their
# own (the default price list), so the clean state is the one a new stack
# starts from. Marked straight away, so a seed that fails below leaves a
# database the next run may still reset.
echo "==> Dropping the database and the uploaded files"
sql >/dev/null <<SQL
SET client_min_messages = warning;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
DROP SCHEMA IF EXISTS drizzle CASCADE;
COMMENT ON SCHEMA public IS '$mark';
SQL
# As root, and handed back to the node user the api and the seeder run as, so a
# volume that came out root-owned — first mounted by a root container, or
# filled from an image's own /media — is repaired on the next reset.
docker compose run --rm --no-deps --user root --entrypoint sh seed \
  -c 'find /media -mindepth 1 -delete && chown node:node /media'

echo "==> Migrating and seeding"
docker compose run --rm --no-deps migrate
docker compose run --rm seed
# The admin's password stays the deploy's: a reset recreates the account on
# every run, so a forced change would be asked for again each time.
docker compose run --rm --no-deps -e ADMIN_FORCE_PASSWORD_CHANGE=false bootstrap-admin
sql >/dev/null <<SQL
COMMENT ON SCHEMA public IS '$mark $loaded';
SQL

# The new schema's settings row has maintenance off, and the restart drops
# every other cache the old database filled.
echo "==> Opening the shop again"
docker compose restart api
await_maintenance false

# A seeded page, so a seed that wrote nothing fails here rather than in front
# of a visitor.
echo "==> Smoke check https://$domain/api/pages/about"
seeded=
for _ in $(seq 1 36); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$domain/api/pages/about" 2>/dev/null)" = 200 ]; then
    seeded=1
    break
  fi
  sleep 5
done
if [ -z "$seeded" ]; then
  echo "FAILED: https://$domain/api/pages/about did not answer after the seed" >&2
  docker compose ps --format 'table {{.Name}}\t{{.Status}}' >&2 || true
  exit 1
fi

start_simulation fresh
echo "OK: '$stack' holds the seed bundle ($loaded)"
