#!/usr/bin/env bash
# Deploys to a provisioned VM over SSH: shared Traefik proxy (idempotent, only
# changes on first run or config edits) + one app stack, then smoke-checks the
# public URL. Used manually for rehearsals and by the demo-up / CD workflows —
# keep it free of anything GitHub-Actions-specific.
#
# Usage:
#   infra/deploy.sh <host> <app-env-file> <traefik-env-file> [overlay-compose-file]
# e.g.
#   infra/deploy.sh 1.2.3.4 .env.demo infra/traefik/.env
#
# The optional overlay is copied to the VM as compose.override.yml (which Compose
# auto-merges): non-prod stacks pass compose.mailpit.yml to add the Mailpit sink
# + reviewer inbox; prod passes nothing and stays Mailpit-free.
#
# SSH: connects as the "deploy" user (see cloud-init.yml). Supply the key via
# ssh-agent/ssh config, or SSH_OPTS, e.g. for a rehearsal from the workstation:
#   SSH_OPTS="-i /path/to/deploy-private-key" infra/deploy.sh ...
# CI additionally wants SSH_OPTS="... -o StrictHostKeyChecking=accept-new".
#
# Observability: opt-in per VM. Set OBSERVABILITY_ENV=<path to an env
# file, see infra/observability/.env.example> to also bring up the shared
# Loki/Alloy/Grafana stack once per VM (idempotent, like Traefik). Unset -> the
# stack is left untouched, so the ephemeral demo simply omits it.
#
# Images: `up --no-build` pulls images missing on the host (never builds — the
# VM has no source tree). To rehearse before CI has published any images,
# preload local builds under the exact tags the env file references:
#   docker save IMAGE... | gzip | ssh deploy@HOST 'gunzip | docker load'
set -euo pipefail

host=${1:?usage: deploy.sh <host> <app-env-file> <traefik-env-file> [overlay-compose-file]}
app_env=${2:?usage: deploy.sh <host> <app-env-file> <traefik-env-file> [overlay-compose-file]}
traefik_env=${3:?usage: deploy.sh <host> <app-env-file> <traefik-env-file> [overlay-compose-file]}
overlay=${4:-}
obs_env=${OBSERVABILITY_ENV:-}

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

# Optional overlay -> compose.override.yml (auto-merged by every compose command
# in the dir). When absent, clear any override a previous deploy left behind, so
# a stack never silently keeps an overlay it should no longer have.
if [ -n "$overlay" ]; then
  put "$overlay" "/srv/b2b/$stack/compose.override.yml"
else
  run "rm -f /srv/b2b/$stack/compose.override.yml"
fi

echo "==> Starting shared Traefik proxy"
run "docker network inspect traefik >/dev/null 2>&1 || docker network create traefik"
run "cd /srv/b2b/traefik && docker compose up -d"

# Shared observability stack (opt-in) — brought up once per VM on the same
# external Traefik network, idempotently, before the app stack so its logs are
# collected from the first start.
if [ -n "$obs_env" ]; then
  echo "==> Starting shared observability stack"
  run "mkdir -p /srv/b2b/observability"
  put "$repo_root/infra/observability/compose.yml" /srv/b2b/observability/compose.yml
  put "$obs_env" /srv/b2b/observability/.env
  run "cd /srv/b2b/observability && docker compose up -d"
fi

echo "==> Starting app stack '$stack'"
run "cd /srv/b2b/$stack && docker compose up -d --no-build"

# Idempotent upsert of seed data. Runs to completion (or fails the deploy);
# the 'tools' profile keeps it out of the `up` above, which has already run the
# `migrate` one-shot — so the schema exists by the time this runs.
echo "==> Seeding database"
run "cd /srv/b2b/$stack && docker compose run --rm seed"

# First hit also triggers the Let's Encrypt issuance, so allow a generous
# window: DNS propagation + cert order can take a minute or two on a fresh VM.
# Require the seeded API page too, so a routing or seed failure fails loudly.
echo "==> Smoke check https://$domain"
for _ in $(seq 1 36); do
  if curl -fsS --max-time 10 "https://$domain/" >/dev/null 2>&1 &&
    curl -fsS --max-time 10 "https://$domain/api/pages/about" >/dev/null 2>&1; then
    echo "OK: https://$domain is up and serving seeded content"
    exit 0
  fi
  sleep 5
done

echo "FAILED: https://$domain did not come up; inspecting the VM:" >&2
run "docker ps --format 'table {{.Names}}\t{{.Status}}' && cd /srv/b2b/traefik && docker compose logs --tail 20 traefik" >&2 || true
exit 1
