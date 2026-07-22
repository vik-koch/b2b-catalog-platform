# 0017 — Scheduled database backups via a compose sidecar

**Status:** accepted · **Date:** 2026-07-22

## Context

NFR-OPS-04 requires database backups on a **defined schedule**. Postgres holds
the only irreplaceable state on a long-lived VM: everything else — images,
compose files, Traefik/observability config — is rebuilt from the repo by CI
(NFR-OPS-01), but catalog content, accounts, and orders entered through the
running app exist nowhere else.

Constraints, consistent with the rest of the platform:

- **Right-sizing.** The platform builds the _application_ custom (0001) but takes
  _infrastructure_ off the shelf — Traefik (0005), Grafana Loki (0016), Postgres
  itself. A backup runner is infra, so the consistent move is a small focused
  component, not a bespoke one.
- **Multi-arch.** Prod runs on the ARM64 pet VM; anything added to the deploy
  stack must have a `linux/arm64` variant (0007).
- **Environment split.** `compose.yml` is deployed to every stack, but only the
  **long-lived** ones (dev, prod) hold state worth keeping. The **ephemeral
  demo** (0006) is thrown away per run — backing it up is pure waste. The single
  `compose.override.yml` overlay slot is already taken by the Mailpit overlay
  (non-prod), so scope has to be expressed some other way.

Alternatives considered: (a) a host cron / systemd timer calling `pg_dump` over
SSH; (b) Postgres continuous archiving / PITR (WAL shipping); (c) a managed
provider backup feature; (d) an off-the-shelf `pg_dump` sidecar container in the
stack.

## Decision

- Add a **`db-backup` sidecar** to `compose.yml` —
  `prodrigestivill/postgres-backup-local:18-alpine` — running `pg_dump` on a cron
  **`SCHEDULE` (default `@daily`)** with built-in **daily/weekly/monthly
  rotation**.
- Dumps are written to **`./backups`** — a bind mount resolving to
  `/srv/b2b/<stack>/backups` on the VM — so an operator can copy them off with a
  plain `scp -r deploy@host:/srv/b2b/<stack>/backups .`, alongside the stack's
  `.env`. No dump ever lands in the DB volume it protects.
- The service sits in a **`backup` compose profile**, off by default (mirroring
  the existing `tools` profile for `seed`). Long-lived stacks opt in with
  `COMPOSE_PROFILES=backup` in their `.env`; the demo's env omits it, so the
  sidecar simply never starts there — no overlay, no `deploy.sh` change.
- **Restore** is a documented manual step, not automated:
  `zcat backups/last/<db>-latest.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"`.

## Rationale

1. **A sidecar over host cron (a).** Host cron lives outside the git-tracked
   stack — exactly the hand-run-against-prod state NFR-OPS-01 exists to avoid.
   The sidecar is declared in `compose.yml`, deployed like everything else, and
   brings schedule + rotation + a healthcheck with it. Reusing the bare
   `postgres:18-alpine` image with a hand-rolled cron loop was the runner-up, but
   owning retention logic to save one small, focused image is the kind of
   reinvention the off-the-shelf-infra principle rejects.
2. **Logical dumps over PITR (b).** WAL archiving buys a near-zero RPO but wants
   a place to ship WAL and a base backup to replay onto — real operational
   surface for a one-VM shop whose acceptable loss is "up to a day". A nightly
   `pg_dump` is the right-sized fit; PITR can be revisited if the data ever
   justifies it, and nothing here blocks it.
3. **Portable dumps over a provider feature (c).** A `pg_dump` artifact restores
   onto any Postgres anywhere — it survives changing hosts and stays identical
   across the demo, dev, and (private-repo) prod deployments. A provider snapshot
   would tie durability to one host and leak provider specifics into the public
   stack.
4. **Profile over overlay for scope.** Profiles express "this stack opts in" with
   one env var and zero moving parts, keep the service visible in the one
   `compose.yml`, and leave the ephemeral demo lean by default.

Concession: a nightly logical dump means an RPO of up to ~24h and a restore that
briefly locks out writes — acceptable for this workload, revisit with PITR if not.
The dumps live on the same VM as the database, so this alone does not survive VM
loss; getting a copy **off** the box — a periodic pull to an operator's machine
or an online persistence volume — is deliberately left to a follow-up (a small
scheduled sync job), and the bind-mount location above is chosen to make that
trivial to bolt on.

## Consequences

- (+) NFR-OPS-04 satisfied on every stateful stack: a scheduled, rotated,
  version-matched dump with no host-level cron and no manual commands.
- (+) Dumps sit in the stack directory, one `scp` from an offline copy, next to
  the `.env` needed to stand the stack back up.
- (+) Same in-stack, declarative pattern as the rest of the deploy; the demo
  stays lean by simply not enabling the profile.
- (−) One more container (and its `./backups` disk footprint) on long-lived VMs.
- (−) RPO up to ~24h; no point-in-time recovery (mitigable later via PITR).
- (−) Backups share the DB's VM until a follow-up off-box sync exists — this
  guards against data corruption / bad migrations, not yet against VM loss.
- (−) A second data class (catalog media) will need its own backup path once it
  exists; this ADR intentionally leaves that open.
