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
# Seeding: opt-in and OFF by default. Set SEED=1 to upsert seed data after the
# stack is up (dev/demo do — they need demo content). Prod leaves it unset, so a
# real catalog is never overwritten by an accidental seed: the seed one-shot is
# also parked in the 'tools' compose profile, so nothing but this explicit,
# opted-in step ever runs it.
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
seed=${SEED:-}

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

# Per-deployment config/text: the web + api mount ./config read-only
# and load their branding/text/wording WHOLE from it — there is no baked default,
# so the dir must carry a complete config or the containers fail to boot.
# CONFIG_DIR defaults to this repo's committed demo config (dev/demo); a real
# deployment overrides it with its own dir (e.g. from the private repo). Replaced
# wholesale so a removed file does not linger from a previous deploy.
config_dir=${CONFIG_DIR:-$repo_root/config}
echo "==> Copying deployment config from $config_dir"
# tar over ssh rather than `scp -r`: config/ now has a subdir (assets/), and
# OpenSSH 9's SFTP-mode scp fails to create a not-yet-existing remote subdir
# ("realpath ...: No such file / path canonicalization failed"). tar streams the
# whole tree in one shot and still replaces wholesale (dir wiped just above).
# Empty the dir in place rather than rm -rf'ing it: a running container's bind
# mount is bound to the directory *inode*, so recreating the dir would leave an
# already-running container mounting a now-deleted inode (a stale, empty
# /config). Preserving the inode keeps existing mounts valid; the force-recreate
# below then makes the app actually reload the refreshed files.
run "mkdir -p /srv/b2b/$stack/config && find /srv/b2b/$stack/config -mindepth 1 -delete"
tar -C "$config_dir" -cf - . | run "tar -C /srv/b2b/$stack/config -xf -"

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

# web + api load their config WHOLE at boot from the ./config mount (ADR 0018).
# The `up` above only recreates them when their image or compose config changes,
# so a config-only redeploy (same image) would leave them running with the
# previous config still in memory. Force just those two to restart so config
# edits always take effect; --no-deps leaves postgres and the one-shot migrate
# (already run above) untouched.
run "cd /srv/b2b/$stack && docker compose up -d --no-build --force-recreate --no-deps web api"

# Idempotent upsert of seed data — opt-in only (SEED=1). Runs to completion (or
# fails the deploy); the 'tools' profile keeps it out of the `up` above, which
# has already run the `migrate` one-shot — so the schema exists by the time this
# runs. Prod never sets SEED, so its data is left untouched.
if [ -n "$seed" ]; then
  echo "==> Seeding database"
  run "cd /srv/b2b/$stack && docker compose run --rm seed"
fi

# First hit also triggers the Let's Encrypt issuance, so allow a generous
# window: DNS propagation + cert order can take a minute or two on a fresh VM.
# When seeded, require a seeded API page too, so a routing or seed failure fails
# loudly; unseeded (prod) only asserts the app is reachable — no content yet.
echo "==> Smoke check https://$domain"
for _ in $(seq 1 36); do
  if curl -fsS --max-time 10 "https://$domain/" >/dev/null 2>&1 &&
    { [ -z "$seed" ] || curl -fsS --max-time 10 "https://$domain/api/pages/about" >/dev/null 2>&1; }; then
    echo "OK: https://$domain is up"
    exit 0
  fi
  sleep 5
done

echo "FAILED: https://$domain did not come up; inspecting the VM:" >&2
run "docker ps --format 'table {{.Names}}\t{{.Status}}' && cd /srv/b2b/traefik && docker compose logs --tail 20 traefik" >&2 || true
exit 1
