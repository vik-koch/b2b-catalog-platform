#!/usr/bin/env bash
# Resets a demo stack to a seed bundle: its database and uploaded files are
# dropped, the schema is migrated afresh, the bundle is loaded and the
# bootstrap admin created again — the stack afterwards holds the bundle and
# nothing else. Run after infra/deploy.sh has brought the stack up. A real
# shop's deploy never calls it.
#
# Usage:
#   SEED_DIR=deployments/<name>/seed infra/seed.sh <host> <app-env-file>
#
# The app env file is the one deploy.sh was given. Needs the built seeder
# (`npx nx build seeder` -> dist/apps/seeder), built from the same commit as the
# images the stack runs. SSH as for deploy.sh (SSH_OPTS).
#
# Only when something changed: a reset records what it loaded — the bundle,
# the seeder build and the stack's deployment.json, as one hash — and a run
# that would load the same again leaves the stack alone. SEED_FORCE=1 resets
# regardless.
#
# The shop shows its maintenance page meanwhile (FR-ADM-04) rather than going
# dark: the api is restarted with the flag on, keeps answering from it while
# the schema goes, and is restarted again on the new database. The web never
# restarts.
#
# The guard: a database is reset only if a reset made it — a mark this script
# leaves on the schema — or if it holds nothing a shop would miss: no product,
# category or order, and no account but the bootstrap admin. A real shop's
# database never carries the mark, so this script pointed at the wrong host or
# stack stops before anything is dropped. A stack that was filled some other
# way is reset by hand once (infra/README.md, "Seeding a demo stack").
set -euo pipefail

host=${1:?usage: seed.sh <host> <app-env-file>}
app_env=${2:?usage: seed.sh <host> <app-env-file>}
force=${SEED_FORCE:-}

repo_root=$(cd "$(dirname "$0")/.." && pwd)
seeder_dir=$repo_root/dist/apps/seeder
seed_dir=${SEED_DIR:?SEED_DIR must name the seed bundle to load}
[ -f "$seeder_dir/main.cjs" ] || { echo "seed.sh needs the built seeder: npx nx build seeder" >&2; exit 1; }
[ -f "$seed_dir/catalog.json" ] || { echo "SEED_DIR $seed_dir holds no seed bundle" >&2; exit 1; }

stack=$(sed -n 's/^STACK_NAME=//p' "$app_env")
domain=$(sed -n 's/^APP_DOMAIN=//p' "$app_env")
db_user=$(sed -n 's/^POSTGRES_USER=//p' "$app_env")
db_name=$(sed -n 's/^POSTGRES_DB=//p' "$app_env")
: "${stack:?STACK_NAME missing in $app_env}"
: "${domain:?APP_DOMAIN missing in $app_env}"
: "${db_user:?POSTGRES_USER missing in $app_env}"
: "${db_name:?POSTGRES_DB missing in $app_env}"

# The mark a reset leaves on the schema it creates. Followed by the hash of
# what it loaded once the seed has gone through, and by nothing until then, so
# a seed that fails is never taken for one that is done.
mark='b2b-catalog-platform: reset to a seed bundle'

run() { ssh ${SSH_OPTS:-} "deploy@$host" "$@"; }
compose() { run "cd /srv/b2b/$stack && docker compose $*"; }
# SQL on stdin, answers on stdout, unaligned and without headers.
sql() { compose "exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -tA -U '$db_user' -d '$db_name'"; }

# What a reset would load: every file of the bundle by its path, the seeder
# build, and the config the stack runs (the seeder reads its consent setting).
loaded=$(
  {
    (cd "$seed_dir" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum)
    sha256sum <"$seeder_dir/main.cjs"
    run "cat /srv/b2b/$stack/config/deployment.json" | sha256sum
  } | sha256sum | cut -c1-16
)

echo "==> Checking that '$stack' on $host is a stack a seed may reset"
read -r state recorded < <(sql <<SQL
SELECT CASE
  WHEN obj_description('public'::regnamespace, 'pg_namespace') LIKE '$mark%' THEN 'reset-before'
  WHEN NOT EXISTS (SELECT 1 FROM products)
   AND NOT EXISTS (SELECT 1 FROM categories)
   AND NOT EXISTS (SELECT 1 FROM orders)
   AND (SELECT count(*) FROM users) <= 1 THEN 'empty'
  ELSE 'refused'
END || ' ' || coalesce(nullif(substr(obj_description('public'::regnamespace, 'pg_namespace'), length('$mark') + 2), ''), '-');
SQL
)
if [ "$state" = refused ]; then
  echo "REFUSED: '$stack' holds data no seed put there. seed.sh resets demo stacks only;" >&2
  echo "if this is one, reset its database by hand once (infra/README.md)." >&2
  exit 1
fi
if [ "$state" = reset-before ] && [ "$recorded" = "$loaded" ] && [ -z "$force" ]; then
  echo "OK: '$stack' already holds this bundle ($loaded); SEED_FORCE=1 resets it anyway"
  exit 0
fi
echo "    $state, loading $loaded"

# Replaced wholesale, like deploy.sh does the config, so nothing lingers from an
# earlier bundle. Only the seed one-shot mounts these, and it is not running.
echo "==> Copying the seeder and the bundle from $seed_dir"
for dir in seeder seed; do
  run "rm -rf /srv/b2b/$stack/$dir && mkdir -p /srv/b2b/$stack/$dir"
done
tar -C "$seeder_dir" -cf - . | run "tar -C /srv/b2b/$stack/seeder -xf -"
tar -C "$seed_dir" -cf - . | run "tar -C /srv/b2b/$stack/seed -xf -"

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
compose "restart api"
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
compose "run --rm --no-deps --user root --entrypoint sh seed -c 'find /media -mindepth 1 -delete && chown node:node /media'"

echo "==> Migrating and seeding"
compose "run --rm --no-deps migrate"
compose "run --rm seed"
# The admin's password stays the deploy's: a reset recreates the account on
# every run, so a forced change would be asked for again each time.
compose "run --rm --no-deps -e ADMIN_FORCE_PASSWORD_CHANGE=false bootstrap-admin"
sql >/dev/null <<SQL
COMMENT ON SCHEMA public IS '$mark $loaded';
SQL

# The new schema's settings row has maintenance off, and the restart drops
# every other cache the old database filled.
echo "==> Opening the shop again"
compose "restart api"
await_maintenance false

# A seeded page, so a seed that wrote nothing fails here rather than in front
# of a visitor.
echo "==> Smoke check https://$domain/api/pages/about"
for _ in $(seq 1 36); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$domain/api/pages/about" 2>/dev/null)" = 200 ]; then
    echo "OK: '$stack' holds the bundle from $seed_dir ($loaded)"
    exit 0
  fi
  sleep 5
done

echo "FAILED: https://$domain/api/pages/about did not answer after the seed" >&2
compose "ps --format 'table {{.Name}}\t{{.Status}}'" >&2 || true
exit 1
