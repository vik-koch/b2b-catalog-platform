#!/usr/bin/env bash
# Resets a demo stack to a seed bundle when what it would load changed: run
# after infra/deploy.sh has brought the stack up. A real shop's deploy never
# calls it.
#
# Usage:
#   SEED_DIR=deployments/<name>/seed infra/seed.sh <host> <app-env-file>
#
# The app env file is the one deploy.sh was given. Needs the built seeder
# (`npx nx build seeder` -> dist/apps/seeder), built from the same commit as the
# images the stack runs, and for a bundle with a simulation.json the built
# simulator too (`npx nx build erp-sim`), which reset.sh starts after the reset
# (ADR 0068). SSH as for deploy.sh (SSH_OPTS).
#
# The reset itself is infra/reset.sh, which this script puts in the stack's
# directory with the seeder and the bundle and runs there; this script only
# decides whether to.
#
# Only when something changed: a reset records what it loaded — the bundle,
# the seeder build and the stack's deployment.json, as one hash — and a run
# that would load the same again leaves the stack alone. SEED_FORCE=1 resets
# regardless.
set -euo pipefail

host=${1:?usage: seed.sh <host> <app-env-file>}
app_env=${2:?usage: seed.sh <host> <app-env-file>}
force=${SEED_FORCE:-}

repo_root=$(cd "$(dirname "$0")/.." && pwd)
seeder_dir=$repo_root/dist/apps/seeder
sim_dir=$repo_root/dist/apps/erp-sim
seed_dir=${SEED_DIR:?SEED_DIR must name the seed bundle to load}
[ -f "$seeder_dir/main.cjs" ] || { echo "seed.sh needs the built seeder: npx nx build seeder" >&2; exit 1; }
[ -f "$seed_dir/catalog.json" ] || { echo "SEED_DIR $seed_dir holds no seed bundle" >&2; exit 1; }
# The simulated back office travels with a bundle that describes one.
simulated=
if [ -f "$seed_dir/simulation.json" ]; then
  [ -f "$sim_dir/main.cjs" ] || { echo "$seed_dir has a simulation.json; seed.sh needs the built simulator: npx nx build erp-sim" >&2; exit 1; }
  simulated=1
fi

stack=$(sed -n 's/^STACK_NAME=//p' "$app_env")
: "${stack:?STACK_NAME missing in $app_env}"
dir=/srv/b2b/$stack

run() { ssh ${SSH_OPTS:-} "deploy@$host" "$@"; }

# What a reset would load: every file of the bundle by its path, the seeder
# build, the simulator build where there is one, and the config the stack runs
# (the seeder reads its consent setting, the simulator its time zone). A new
# simulator is a new week: it starts again from the bundle.
loaded=$(
  {
    (cd "$seed_dir" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum)
    sha256sum <"$seeder_dir/main.cjs"
    [ -z "$simulated" ] || sha256sum <"$sim_dir/main.cjs"
    run "cat $dir/config/deployment.json" | sha256sum
  } | sha256sum | cut -c1-16
)

# Every run, so the status below is read by the current script.
echo "==> Copying the reset script to $dir"
run "cat > $dir/reset.sh && chmod +x $dir/reset.sh" <"$repo_root/infra/reset.sh"

echo "==> Checking what '$stack' on $host holds"
read -r state recorded < <(run "$dir/reset.sh --status")
if [ "$state" = refused ]; then
  echo "REFUSED: '$stack' holds data no seed put there. seed.sh resets demo stacks only;" >&2
  echo "if this is one, reset its database by hand once (infra/README.md)." >&2
  exit 1
fi
if [ "$state" = reset-before ] && [ "$recorded" = "$loaded" ] && [ -z "$force" ]; then
  echo "OK: '$stack' already holds this bundle ($loaded); SEED_FORCE=1 resets it anyway"
  exit 0
fi

# Replaced wholesale, like deploy.sh does the config, so nothing lingers from an
# earlier bundle. Only the seed one-shot mounts these, and it is not running.
echo "==> Copying the seeder and the bundle from $seed_dir"
for sub in seeder seed; do
  run "rm -rf $dir/$sub && mkdir -p $dir/$sub"
done
tar -C "$seeder_dir" -cf - . | run "tar -C $dir/seeder -xf -"
tar -C "$seed_dir" -cf - . | run "tar -C $dir/seed -xf -"
run "rm -rf $dir/erp-sim"
if [ -n "$simulated" ]; then
  run "mkdir -p $dir/erp-sim"
  tar -C "$sim_dir" -cf - . | run "tar -C $dir/erp-sim -xf -"
fi
printf '%s\n' "$loaded" | run "cat > $dir/seed.hash"

run "$dir/reset.sh"
