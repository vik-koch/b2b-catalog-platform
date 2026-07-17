#!/usr/bin/env bash
# Deploys to a provisioned VM over SSH: shared Traefik proxy (idempotent, only
# changes on first run or config edits) + one app stack, then smoke-checks the
# public URL. Used manually for rehearsals and by the demo-up / CD workflows —
# keep it free of anything GitHub-Actions-specific.
#
# Usage:
#   infra/deploy.sh <host> <app-env-file> <traefik-env-file>
# e.g.
#   infra/deploy.sh 1.2.3.4 .env.demo infra/traefik/.env
#
# SSH: connects as the "deploy" user (see cloud-init.yml). Supply the key via
# ssh-agent/ssh config, or SSH_OPTS, e.g. for a rehearsal from the workstation:
#   SSH_OPTS="-i /path/to/deploy-private-key" infra/deploy.sh ...
# CI additionally wants SSH_OPTS="... -o StrictHostKeyChecking=accept-new".
#
# Images: `up --no-build` pulls images missing on the host (never builds — the
# VM has no source tree). To rehearse before CI has published any images,
# preload local builds under the exact tags the env file references:
#   docker save IMAGE... | gzip | ssh deploy@HOST 'gunzip | docker load'
set -euo pipefail

host=${1:?usage: deploy.sh <host> <app-env-file> <traefik-env-file>}
app_env=${2:?usage: deploy.sh <host> <app-env-file> <traefik-env-file>}
traefik_env=${3:?usage: deploy.sh <host> <app-env-file> <traefik-env-file>}

repo_root=$(cd "$(dirname "$0")/.." && pwd)

# STACK_NAME doubles as the stack's directory (= compose project) on the VM so
# several stacks (dev / prod / demo) can coexist; APP_DOMAIN is smoke-checked.
stack=$(sed -n 's/^STACK_NAME=//p' "$app_env")
domain=$(sed -n 's/^APP_DOMAIN=//p' "$app_env")
: "${stack:?STACK_NAME missing in $app_env}"
: "${domain:?APP_DOMAIN missing in $app_env}"

run() { ssh ${SSH_OPTS:-} "deploy@$host" "$@"; }
put() { scp ${SSH_OPTS:-} -q "$1" "deploy@$host:$2"; }

echo "==> Copying stacks to deploy@$host"
run "mkdir -p /srv/b2b/traefik /srv/b2b/$stack"
put "$repo_root/infra/traefik/compose.yml" /srv/b2b/traefik/compose.yml
put "$traefik_env" /srv/b2b/traefik/.env
put "$repo_root/compose.yml" "/srv/b2b/$stack/compose.yml"
put "$app_env" "/srv/b2b/$stack/.env"

echo "==> Starting shared Traefik proxy"
run "docker network inspect traefik >/dev/null 2>&1 || docker network create traefik"
run "cd /srv/b2b/traefik && docker compose up -d"

echo "==> Starting app stack '$stack'"
run "cd /srv/b2b/$stack && docker compose up -d --no-build"

# First hit also triggers the Let's Encrypt issuance, so allow a generous
# window: DNS propagation + cert order can take a minute or two on a fresh VM.
echo "==> Smoke check https://$domain"
for _ in $(seq 1 36); do
  if curl -fsS --max-time 10 "https://$domain/" >/dev/null 2>&1; then
    echo "OK: https://$domain is up"
    exit 0
  fi
  sleep 5
done

echo "FAILED: https://$domain did not come up; inspecting the VM:" >&2
run "docker ps --format 'table {{.Names}}\t{{.Status}}' && cd /srv/b2b/traefik && docker compose logs --tail 20 traefik" >&2 || true
exit 1
