#!/usr/bin/env bash
# Downloads a backup archive from the deployment's bucket (ADR 0067) — the way
# back when the VM, and every copy on it, is gone.
#
# Usage:
#   infra/fetch-backup.sh <app-env-file> [dest-dir]
# e.g.
#   AWS_PROFILE=shop-restore infra/fetch-backup.sh .env.prod ~/backups/prod
#
# Endpoint, bucket and path come from the app env file (BACKUP_S3_*). The
# credentials do not: the key in that file can only upload. Use the read-only
# restore key, through the aws CLI's own means — a profile (AWS_PROFILE) or
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
#
# Picks the newest archive by default. To choose:
#   LIST=1                 lists the archives and their versions, downloads nothing
#   KEY=backup-...age      takes that archive
#   VERSION=<version id>   takes an older version of it — when the current one
#                          fails to decrypt, something replaced it, and the
#                          bucket kept what was there before
#
# Needs the aws CLI. Restore what it fetched with infra/restore.sh.
set -euo pipefail

app_env=${1:?usage: fetch-backup.sh <app-env-file> [dest-dir]}
dest=${2:-.}

value() { sed -n "s/^$1=//p" "$app_env"; }
stack=$(value STACK_NAME)
endpoint=$(value BACKUP_S3_ENDPOINT)
bucket=$(value BACKUP_S3_BUCKET)
path=$(value BACKUP_S3_PATH)
: "${endpoint:?BACKUP_S3_ENDPOINT missing in $app_env — this deployment keeps no backups off the host}"
: "${bucket:?BACKUP_S3_BUCKET missing in $app_env}"
path=${path:-$stack}
prefix=${path:+$path/}

# The sidecar takes a bare host name and defaults to https.
case $endpoint in *://*) ;; *) endpoint=https://$endpoint ;; esac
s3() { aws --endpoint-url "$endpoint" s3api "$@"; }

if [ -n "${LIST:-}" ]; then
  s3 list-object-versions --bucket "$bucket" --prefix "${prefix}backup-" \
    --query 'Versions[].[Key,VersionId,LastModified,Size,IsLatest]' --output table
  exit 0
fi

# Names carry the time they were taken, so the newest sorts last.
key=${KEY:+$prefix$KEY}
if [ -z "$key" ]; then
  key=$(s3 list-objects-v2 --bucket "$bucket" --prefix "${prefix}backup-" \
    --query 'Contents[].Key' --output text | tr '\t' '\n' | grep -v '^None$' | sort | tail -n 1)
fi
: "${key:?no backup archive under s3://$bucket/$prefix}"

mkdir -p "$dest"
out=$dest/${key##*/}
echo "==> Downloading s3://$bucket/$key${VERSION:+ (version $VERSION)} to $out"
s3 get-object --bucket "$bucket" --key "$key" ${VERSION:+--version-id "$VERSION"} "$out" >/dev/null

echo
ls -lh "$out"
echo
echo "Restore with:  infra/restore.sh <host> $app_env $out"
