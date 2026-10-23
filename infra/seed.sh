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
# The guard: a database is reset only if a reset made it — a mark this script
# leaves on the schema — or if it holds nothing a shop would miss: no product,
# category or order, and no account but the bootstrap admin. A real shop's
# database never carries the mark, so this script pointed at the wrong host or
# stack stops before anything is dropped. A stack that was filled some other
# way is reset by hand once (infra/README.md, "Seeding a demo stack").
set -euo pipefail

host=${1:?usage: seed.sh <host> <app-env-file>}
app_env=${2:?usage: seed.sh <host> <app-env-file>}

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

# The mark a reset leaves on the schema it creates.
mark='b2b-catalog-platform: reset to a seed bundle'

run() { ssh ${SSH_OPTS:-} "deploy@$host" "$@"; }
compose() { run "cd /srv/b2b/$stack && docker compose $*"; }
# SQL on stdin, answers on stdout, unaligned and without headers.
sql() { compose "exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -tA -U '$db_user' -d '$db_name'"; }

echo "==> Checking that '$stack' on $host is a stack a seed may reset"
state=$(sql <<SQL
SELECT CASE
  WHEN obj_description('public'::regnamespace, 'pg_namespace') = '$mark' THEN 'reset before'
  WHEN NOT EXISTS (SELECT 1 FROM products)
   AND NOT EXISTS (SELECT 1 FROM categories)
   AND NOT EXISTS (SELECT 1 FROM orders)
   AND (SELECT count(*) FROM users) <= 1 THEN 'empty'
  ELSE 'refused'
END;
SQL
)
if [ "$state" = refused ]; then
  echo "REFUSED: '$stack' holds data no seed put there. seed.sh resets demo stacks only;" >&2
  echo "if this is one, reset its database by hand once (infra/README.md)." >&2
  exit 1
fi
echo "    $state"

# Replaced wholesale, like deploy.sh does the config, so nothing lingers from an
# earlier bundle. Only the seed one-shot mounts these, and it is not running.
echo "==> Copying the seeder and the bundle from $seed_dir"
for dir in seeder seed; do
  run "rm -rf /srv/b2b/$stack/$dir && mkdir -p /srv/b2b/$stack/$dir"
done
tar -C "$seeder_dir" -cf - . | run "tar -C /srv/b2b/$stack/seeder -xf -"
tar -C "$seed_dir" -cf - . | run "tar -C /srv/b2b/$stack/seed -xf -"

# From here to `start` the shop is down: nothing may write while the schema
# goes, and nobody should browse a half-seeded catalog.
echo "==> Stopping the app"
compose "stop web api"

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
compose "run --rm --no-deps --entrypoint sh seed -c 'find /media -mindepth 1 -delete'"

echo "==> Migrating and seeding"
compose "run --rm --no-deps migrate"
compose "run --rm seed"
# The admin's password stays the deploy's: a reset recreates the account on
# every run, so a forced change would be asked for again each time.
compose "run --rm --no-deps -e ADMIN_FORCE_PASSWORD_CHANGE=false bootstrap-admin"

echo "==> Starting the app"
compose "start api web"

# A seeded page, so a seed that wrote nothing fails here rather than in front
# of a visitor. The reset leaves maintenance mode off, so 200 is the only
# answer that counts.
echo "==> Smoke check https://$domain/api/pages/about"
for _ in $(seq 1 36); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$domain/api/pages/about" 2>/dev/null)" = 200 ]; then
    echo "OK: '$stack' holds the bundle from $seed_dir"
    exit 0
  fi
  sleep 5
done

echo "FAILED: https://$domain/api/pages/about did not answer after the seed" >&2
compose "ps --format 'table {{.Name}}\t{{.Status}}'" >&2 || true
exit 1
