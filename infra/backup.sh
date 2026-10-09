#!/usr/bin/env bash
# Takes a fresh backup on a deployed VM and downloads it to this machine.
#
# The stack backs itself up on a schedule (ADRs 0017, 0028, 0067): a nightly
# dump, then one archive holding that dump and the media volume, which also
# goes to the deployment's bucket if it names one. Run this before a risky
# change, or on a stack with no bucket, to hold a pair of your own. With the
# VM gone, infra/fetch-backup.sh gets one from the bucket instead.
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
#
# The archive is encrypted (.age) when the deployment sets BACKUP_AGE_PUBLIC_KEY;
# restore.sh then wants AGE_IDENTITY, the private key.
set -euo pipefail

host=${1:?usage: backup.sh <host> <app-env-file> [dest-dir]}
app_env=${2:?usage: backup.sh <host> <app-env-file> [dest-dir]}

stack=$(sed -n 's/^STACK_NAME=//p' "$app_env")
: "${stack:?STACK_NAME missing in $app_env}"

dest=${3:-./backups-$stack-$(date -u +%Y%m%dT%H%M%SZ)}
remote=/srv/b2b/$stack

run() { ssh ${SSH_OPTS:-} "deploy@$host" "$@"; }

if [ -z "${SKIP_FRESH:-}" ]; then
  # Dump first, then the archive that packs it with the media. Uploads are
  # append-only, so media archived after the dump always contains every image
  # the dump references; the reverse order can hand you a catalog pointing at
  # files that were never archived.
  echo "==> Taking a fresh database dump on $host"
  run "cd $remote && docker compose exec -T db-backup /backup.sh >/dev/null"
  echo "==> Archiving it with the media on $host"
  run "cd $remote && docker compose exec -T media-backup backup >/dev/null 2>&1"
fi

# The latest link names no extension, because whether the archive is encrypted
# is deployment config. Fetch it under its real name, which says.
archive=$(run "readlink $remote/backups/archive/backup-latest" || true)
: "${archive:?no backup archive on $host yet}"

mkdir -p "$dest"
echo "==> Downloading $archive to $dest"
scp ${SSH_OPTS:-} -q "deploy@$host:$remote/backups/archive/$archive" "$dest/"

# The .env is what turns an archive back into a running stack — without
# it a restore has no credentials, domain or image tags. It carries secrets, so
# it lands next to the archive and inherits its handling.
scp ${SSH_OPTS:-} -q "deploy@$host:$remote/.env" "$dest/env.backup"

echo
echo "Downloaded:"
ls -lh "$dest"
echo
echo "Restore with:  infra/restore.sh $host $app_env $dest/$archive"
