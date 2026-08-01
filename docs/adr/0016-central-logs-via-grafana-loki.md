# 0016 — Central application logs via Grafana Loki

**Status:** accepted · **Date:** 2026-07-22 · **Amended:** 2026-08-01 (app logs
are JSON and carry admin audit events; the fields Traefik writes are trimmed;
dashboards and alerts are provisioned) — see the _Amendment_ below

## Context

NFR-OPS-03 requires application logs to be **centrally accessible for
debugging**. Today every service logs to stdout (NestJS `Logger`), Docker
captures it, and the only way to read it is `ssh` + `docker compose logs` on the
VM — not "centrally accessible", and the default `json-file` driver grows
unbounded until it fills the disk.

Constraints that shape the choice, consistent with the rest of the platform:

- **Right-sizing** is the recurring theme — Postgres FTS over Elasticsearch,
  Traefik over an API gateway. A JVM/ELK logging stack would violate it the same
  way Elasticsearch-for-search would.
- **EU/GDPR positioning.** Logs can contain personal data (contact-form input,
  IPs). Shipping them to a third-party SaaS makes that party a processor needing
  a DPA. Keeping logs on the client's own VM is the cleaner story.
- Several environments already exist: the **ephemeral demo** (throwaway VM per
  run), the **long-lived dev** VM (auto-deployed on merge), **client prod**
  (private repo), and **local testing** (`compose.override.yml`, no Traefik).

Alternatives considered: (a) SSH + `docker compose logs` (status quo);
(b) a hosted log SaaS (Grafana Cloud / Axiom / Better Stack free tier);
(c) a live-tail web UI with no storage (Dozzle); (d) self-hosted **Grafana
Loki** + a collector + Grafana.

## Decision

- Run a **shared per-VM observability stack** — `grafana/loki` (log store),
  `grafana/alloy` (collector), `grafana/grafana-oss` (UI) — in
  `infra/observability/compose.yml`, started once per VM exactly like the shared
  Traefik proxy (0005) and self-registering Grafana with Traefik via labels.
- **Alloy** reads the Docker socket (read-only, as Traefik does), tails every
  container's stdout, and labels each line with its compose `stack`/`service`
  so a multi-stack VM (dev + prod) stays filterable. Loki stores to a local
  volume with a 14-day retention window; Grafana exposes it behind its own
  ops hostname over TLS, protected by Grafana's own login.
- **Cap local Docker logs** VM-wide (`json-file`, `max-size`/`max-file` in
  `/etc/docker/daemon.json` via cloud-init) so the on-disk buffer can't fill the
  disk; Loki holds the queryable history.
- **Turn on Traefik access logs** (JSON, no headers) so request-level lines —
  method, path, status, latency for every stack — reach Loki **without any
  application code**. No per-controller `Logger` calls, no request-logging
  interceptor, no structured (JSON) app logging for now. (The last two clauses
  were revisited; see the _Amendment_.)
- The stack is **opt-in per VM** (`OBSERVABILITY_ENV` handed to `deploy.sh`):
  long-lived **dev/prod** run it; the **ephemeral demo** omits it (its logs die
  with the VM anyway, and it avoids a per-run DNS record); **local testing**
  never gets it — `docker compose logs` / the `nx serve` console suffice.

## Rationale

1. **Loki is the right-sized "central" for one VM** — a single Go binary,
   filesystem storage, label-indexed (not full-text). It is to logging what
   Postgres FTS is to search: the deliberately-not-Elasticsearch choice. The
   three images are multi-arch (amd64 + arm64) and add ~300–450 MB RAM total,
   which fits the documented 4 GB VM with headroom.
2. **A collector container beats the Loki Docker log-driver plugin.** The plugin
   would save one container but installs at the Docker-engine level (a host step
   that dirties the otherwise compose-only contract above the VM) and can block
   or drop container logs when Loki is down. Alloy on the socket is decoupled —
   if Loki is unavailable the app is never back-pressured — and mirrors the
   read-only-socket pattern Traefik already uses.
3. **Edge access logs over app-side request logging.** Traefik already sees
   every request; one flag yields uniform method/path/status/latency across all
   stacks with zero app changes and no risk of logging cookies (headers are
   dropped). NestJS already auto-logs unhandled 5xx with stack traces, so the
   app-visible gap — successful/4xx requests — is exactly what the edge covers.

Concessions: single-binary Loki with filesystem storage is not highly available
and its history dies with the VM — acceptable for a one-VM shop, and orthogonal
to durable **data** backups (NFR-OPS-04, its own ADR). If logs ever need to
outlive the VM, Loki can point at S3-compatible object storage without changing
the collector or Grafana. Structured JSON app logging (`nestjs-pino`, per-request
IDs) is deferred until debugging pain justifies it; nothing here blocks adding it
later.

## Consequences

- (+) Logs from every container on a VM are browsable and queryable from one
  Grafana, filtered by stack/service, with 14-day retention — no SSH.
- (+) Request-level visibility (Traefik access logs) with no application code and
  no cookie leakage.
- (+) Capped on-disk logs remove the unbounded-`json-file` disk-fill risk on
  every VM, independent of the rest of the stack.
- (+) Same shared-infra pattern as Traefik; adding/removing an app stack never
  touches it; opt-in keeps the ephemeral demo lean.
- (−) Three more containers (~300–450 MB RAM) on long-lived VMs; the 4 GB
  minimum wants headroom, or a slightly larger VM once dev + prod co-reside.
- (−) Self-hosted logs are not HA and do not survive VM loss (mitigable later via
  object storage); operational, not a data-durability, guarantee.
- (−) A new ops secret + hostname per VM (`GRAFANA_ADMIN_PASSWORD`,
  `GRAFANA_DOMAIN`, one DNS record) to wire dev/prod.

## Amendment — 2026-08-01: what the logs carry, and what watches them

Four of the original decisions have moved. The core one has not: Traefik still
supplies request-level data and the app still does no request logging.

**1. Traefik writes seven fields, not thirty.** The default set carries TLS
ciphers, byte counts and retry overhead that no query has ever used, and it is
stored for 14 days. `accesslog.fields.defaultmode=drop` plus a keep-list
(host, method, path, status, duration, service, retries) makes a line readable
without a parser.

`ClientHost`/`ClientAddr` are **not** kept. A client IP is personal data, and
retaining it needs a purpose this deployment does not have — there is nobody
here to run an abuse investigation with it. Re-enable temporarily, and say so
in the privacy text, if that ever changes.

**2. App logs are JSON in a deployed stack.** "No structured app logging for
now" was right while the only consumer was a person reading `docker compose
logs`. Once Loki is the consumer, ANSI escape codes end up _inside_ the stored
line, where they defeat LogQL matching. Nest's own `ConsoleLogger` does both —
`{ colors: false, json: true }` when `NODE_ENV=production`, the readable format
locally. No new dependency.

**3. Admin mutations are logged as domain events.** "No per-controller `Logger`
calls" was aimed at request logging, and that still holds. But an access log
answers `DELETE /api/admin/products/abc 200`; it cannot answer _who_ deleted it
or _which product that was_, because the actor is in a cookie and the path
carries a slug. A closed set of eight events (product/category created,
updated, deleted, restored, reordered) records action, actor and entity.

This is the searchable half of a trail whose durable half is in the database:
the same change also added `updatedBy`/`deletedBy` to the catalog tables, for
parity with `pages` and `app_settings`. Loki's window is 14 days; a column is
not.

**4. Dashboards and alerts are provisioned from files.** A dashboard that only
exists in Grafana's volume is one VM rebuild from gone. Both now live in
`infra/observability/compose.yml` with `allowUiUpdates: false`.

Alerts cover the three failures that actually end this deployment — disk above
80%, the backup job erroring, a spike of 5xx — and all three are answered from
**logs**. This VM still runs no metrics store, deliberately: a CPU/memory
dashboard on a box using ~10% of its RAM would show flat lines while the disk
quietly fills. Disk usage reaches Loki as a log line from a small sidecar
rather than as a metric, which is what keeps one pipeline sufficient.

Two details worth keeping written down, because both were bugs first:

- Loki **derives `service_name` from `service`** on its own. Queries that
  assumed the `stack/service` form this amendment introduces matched nothing;
  dashboards therefore key on `service`, which has existed since this ADR.
- For the backup and error rules, _no matching log lines_ is the healthy state,
  so they treat no-data as OK. The disk rule does the opposite — silence there
  means the reporter died.

Alert mail is opt-in and unset in CI: dev and public prod send through Mailpit,
which Grafana cannot reach across compose projects. A deployment with real SMTP
configures it in the observability `.env`, and `infra/alert-test.sh` proves the
channel works — alerting is otherwise silent whether it works or not.
