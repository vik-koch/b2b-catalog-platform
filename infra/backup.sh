#!/usr/bin/env bash
# Takes a fresh backup on a deployed VM and downloads it to this machine.
#
# The stack already backs itself up on a schedule (ADR 0017 for the database,
# 0028 for the media volume), but both copies live on the VM that holds the
# originals. This is the "get it off the box" half: run it before a risky change,
# or periodically, so a lost VM is not a lost shop.
#
# Usage:
#   infra/backup.sh <host> <app-env-file> [dest-dir]
# e.g.
#   infra/backup.sh 1.2.3.4 .env.prod
#   infra/backup.sh 1.2.3.4 .env.prod ~/backups/prod
#
# Default dest-dir: ./backups-<stack>-<UTC timestamp>.
#
# SSH: same contract as deploy.sh — connects as "deploy", supply the key via
# ssh-agent/ssh config or SSH_OPTS.
#
# Pass SKIP_FRESH=1 to download whatever the last scheduled run produced instead
# of triggering a new one (useful when the DB is under load).
set -euo pipefail

host=${1:?usage: backup.sh <host> <app-env-file> [dest-dir]}
app_env=${2:?usage: backup.sh <host> <app-env-file> [dest-dir]}

stack=$(sed -n 's/^STACK_NAME=//p' "$app_env")
db=$(sed -n 's/^POSTGRES_DB=//p' "$app_env")
: "${stack:?STACK_NAME missing in $app_env}"
: "${db:?POSTGRES_DB missing in $app_env}"

dest=${3:-./backups-$stack-$(date -u +%Y%m%dT%H%M%SZ)}
remote=/srv/b2b/$stack

run() { ssh ${SSH_OPTS:-} "deploy@$host" "$@"; }

if [ -z "${SKIP_FRESH:-}" ]; then
  # Database first, then media. Uploads are append-only, so an archive taken
  # after the dump always contains every image the dump references; the reverse
  # order can hand you a catalog pointing at files that were never archived.
  echo "==> Taking a fresh database dump on $host"
  run "cd $remote && docker compose exec -T db-backup /backup.sh >/dev/null"
  echo "==> Taking a fresh media archive on $host"
  run "cd $remote && docker compose exec -T media-backup backup >/dev/null 2>&1"
fi

mkdir -p "$dest"
echo "==> Downloading to $dest"
scp ${SSH_OPTS:-} -q "deploy@$host:$remote/backups/last/$db-latest.sql.gz" "$dest/"
scp ${SSH_OPTS:-} -q "deploy@$host:$remote/backups/media/media-latest.tar.gz" "$dest/"

# The .env is what turns a pair of archives back into a running stack — without
# it a restore has no credentials, domain or image tags. It carries secrets, so
# it lands next to the dumps and inherits their handling.
scp ${SSH_OPTS:-} -q "deploy@$host:$remote/.env" "$dest/env.backup"

echo
echo "Downloaded:"
ls -lh "$dest"
echo
echo "Restore with:  infra/restore.sh $host $app_env \\"
echo "                 $dest/$db-latest.sql.gz $dest/media-latest.tar.gz"
