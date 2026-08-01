#!/usr/bin/env bash
# Restores a database dump + media archive onto a deployed stack, over SSH.
#
# This REPLACES the stack's data: the database schemas are dropped and rebuilt
# from the dump, and the media volume is emptied and refilled from the archive.
# Anything written since those artifacts were taken is gone. It asks first;
# FORCE=1 skips the prompt for scripted rehearsals.
#
# Usage:
#   infra/restore.sh <host> <app-env-file> <dump.sql.gz> <media.tar.gz>
# e.g.
#   infra/restore.sh 1.2.3.4 .env.prod ./backups-prod-.../b2b-latest.sql.gz \
#                                      ./backups-prod-.../media-latest.tar.gz
#
# The two artifacts must be a matched pair — a dump restored against an older
# media archive yields a catalog whose images 404. infra/backup.sh takes them
# together, in the right order, for exactly this reason.
#
# SSH: same contract as deploy.sh — connects as "deploy", key via ssh-agent /
# ssh config / SSH_OPTS.
set -euo pipefail

host=${1:?usage: restore.sh <host> <app-env-file> <dump.sql.gz> <media.tar.gz>}
app_env=${2:?usage: restore.sh <host> <app-env-file> <dump.sql.gz> <media.tar.gz>}
dump=${3:?usage: restore.sh <host> <app-env-file> <dump.sql.gz> <media.tar.gz>}
media=${4:?usage: restore.sh <host> <app-env-file> <dump.sql.gz> <media.tar.gz>}

[ -f "$dump" ] || { echo "no such dump: $dump" >&2; exit 1; }
[ -f "$media" ] || { echo "no such media archive: $media" >&2; exit 1; }

stack=$(sed -n 's/^STACK_NAME=//p' "$app_env")
db=$(sed -n 's/^POSTGRES_DB=//p' "$app_env")
db_user=$(sed -n 's/^POSTGRES_USER=//p' "$app_env")
: "${stack:?STACK_NAME missing in $app_env}"
: "${db:?POSTGRES_DB missing in $app_env}"
: "${db_user:?POSTGRES_USER missing in $app_env}"

remote=/srv/b2b/$stack
run() { ssh ${SSH_OPTS:-} "deploy@$host" "$@"; }

if [ -z "${FORCE:-}" ]; then
  echo "About to REPLACE all data in stack '$stack' on $host:"
  echo "  database '$db'  <- $dump"
  echo "  media volume    <- $media"
  printf "Type the stack name to continue: "
  read -r confirm
  [ "$confirm" = "$stack" ] || { echo "aborted"; exit 1; }
fi

echo "==> Uploading artifacts"
run "mkdir -p $remote/restore"
scp ${SSH_OPTS:-} -q "$dump" "deploy@$host:$remote/restore/dump.sql.gz"
scp ${SSH_OPTS:-} -q "$media" "deploy@$host:$remote/restore/media.tar.gz"

# Stop the writers, not the database: the api must not be inserting rows or
# uploading files midway through the swap. Postgres and the media server stay up
# — one is the restore target, the other only reads.
echo "==> Stopping app containers"
run "cd $remote && docker compose stop api web"

echo "==> Restoring database '$db'"
# Drop both schemas rather than restoring over the top: the dump recreates
# `drizzle` (the migration ledger) and every `public` object, and restoring onto
# existing objects leaves a half-merged schema that looks fine until it doesn't.
run "cd $remote && docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U '$db_user' -d '$db' \
  -c 'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'"
run "cd $remote && gunzip -c restore/dump.sql.gz | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U '$db_user' -d '$db' >/dev/null"

# Through compose (rather than `docker run -v <project>_mediadata`) so the volume
# is resolved by the project itself — no guessing at the generated volume name.
# The api image mounts it read-write and ships busybox tar.
echo "==> Restoring media volume"
# Load-bearing: this runs through the *api service*, so it runs as the app's
# unprivileged uid. That is what protects the volume. As root, tar would apply
# the archive's own root-owned root-directory metadata to /media, leaving it
# unwritable by the app — the next upload and the media prune (which swallows
# its errors) would then fail silently. A non-root tar cannot chown, so the
# target directory's ownership and mode survive.
run "cd $remote && docker compose run --rm --no-deps --entrypoint sh \
  -v $remote/restore:/restore:ro api \
  -c 'rm -rf /media/* && tar xzf /restore/media.tar.gz -C /media --strip-components=2'"

echo "==> Starting app containers"
run "cd $remote && docker compose start api web"
run "rm -rf $remote/restore"

echo
echo "Restored '$stack'. Check the catalog and that product images load —"
echo "a dump restored against a mismatched media archive shows up there first."
