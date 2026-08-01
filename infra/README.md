# Infrastructure

One provider-neutral bootstrap file ([cloud-init.yml](cloud-init.yml)) turns a
fresh Ubuntu VM into a deploy target: Docker Engine + compose plugin, a
`deploy` user for CI, and `/srv/b2b` as the directory the deploy workflow
copies compose files into. Everything above the VM (TLS, routing, the apps)
lives in the compose stacks, so the contract with the infrastructure layer is
just: _a VM with Docker, a `deploy` user, and a DNS record pointing at it._

On top of that contract every VM runs one [shared Traefik proxy](traefik/)
(started once per VM — TLS via Let's Encrypt, 80→443 redirect) and any number
of app stacks (the root [compose.yml](../compose.yml), one `.env` per stack)
that self-register their routing with Traefik via container labels.

Long-lived VMs (dev/prod) additionally run one [shared observability
stack](observability/) — Loki + Alloy + Grafana, started once per VM the same
way — that collects every container's stdout and exposes it through Grafana on
its own ops hostname. It is **opt-in**: `deploy.sh` brings it up only when given
`OBSERVABILITY_ENV`, so the ephemeral demo omits it. See
[ADR 0016](../docs/adr/0016-central-logs-via-grafana-loki.md).

There are two ways to get such a VM:

- **Terraform demo** ([demo/](demo/)) — a worked example wired specifically to
  **Hetzner Cloud + Cloudflare DNS**: server, firewall and a
  `b2b-demo-<id>.vikkoch.com` record, created and destroyed on demand by the
  `demo-up` / `demo-down` workflows. It is deliberately not provider-abstracted;
  porting it means rewriting the (small) root module against another provider's
  resources — the cloud-init/compose layer above needs no changes.
- **Manual, any VPS provider** — no Terraform involved, see
  [Manual setup without Terraform](#manual-setup-without-terraform).

## VM requirements

Whatever the provider, the VM needs:

- **2 vCPU / 2 GB RAM, ≥ 40 GB disk** for a single production stack with the
  observability stack alongside it; **4 GB** once a VM carries several app
  stacks (the dev+prod box). Measured resident memory, after driving 200
  server-rendered page loads through the stack:

  |                                        | idle  | under load |
  | -------------------------------------- | ----- | ---------- |
  | web (Angular SSR)                      | 46 MB | **271 MB** |
  | api (NestJS)                           | 48 MB | 60 MB      |
  | postgres                               | 30 MB | 33 MB      |
  | media (nginx)                          | 13 MB | 13 MB      |
  | traefik (one per VM)                   |       | 12 MB      |
  | observability (Loki + Alloy + Grafana) |       | 202 MB     |

  A client production VM — one stack, no Mailpit, plus Traefik and
  observability — measures ~590 MB, so with Ubuntu and dockerd it sits near
  1 GB. That fits 2 GB, with two things worth doing at that size:
  - **Cap the SSR heap** (`NODE_OPTIONS=--max-old-space-size=192` on `web`).
    The 271 MB above is V8 heap growth, which Node does not return eagerly;
    capping it makes the process collect earlier instead of expanding into
    memory Postgres needs.
  - **Configure swap.** The spiky moments are not page loads but image uploads
    (libvips allocates outside the V8 heap) and a large catalog sync. Swap
    turns a spike into slowness rather than an OOM kill.

  With neither, prefer 4 GB. The demo/dev box (Oracle Always Free, 24 GB) is
  not memory-constrained and needs none of this.

- **amd64 or arm64** — CI publishes multi-arch images
  (`linux/amd64` + `linux/arm64`), the VM pulls its native variant.
- **Ubuntu LTS (24.04)** — cloud-init.yml is only tested on Ubuntu and leans on
  Ubuntu/Debian specifics (`netfilter-persistent`, image default users). Other
  distros would need adjustments.

## One-time setup

1. **SSH deploy key**: `ssh-keygen -t ed25519 -C "b2b-demo-deploy" -f deploy -N ""`.
   Public key → [keys/deploy.pub](keys/deploy.pub) **and** the
   `ssh_authorized_keys` entry in [cloud-init.yml](cloud-init.yml) (committed).
   Private key → GitHub Actions secret, then delete locally.
2. **HCP Terraform** (state backend, free tier): create an organization at
   app.terraform.io, put its name into the `cloud` block in
   [demo/main.tf](demo/main.tf). After the first `terraform init` creates the
   `b2b-demo` workspace, set the workspace's **execution mode to "Local"**
   (Settings → Execution Mode) — otherwise HCP tries to run applies on its own
   runners, where the provider tokens don't exist.
3. **Cloudflare zone id**: dashboard → vikkoch.com → Overview (right column) →
   into [demo/demo.auto.tfvars](demo/demo.auto.tfvars).
4. **GHCR visibility**: after the first merge to `main` publishes the images,
   make both packages public (package → Package settings → Change visibility)
   so VMs can pull without a registry login.
5. **GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions):

   Naming: `DEPLOY_*` = the shared deploy target/key (dev, prod and demo all use
   it); `DEV_*` / `PROD_*` = one environment's own domain + DB password; the rest
   are provider tokens or shared services.

   The auth secrets (`JWT_SECRET`, `ADMIN_*`, see
   [ADR 0019](../docs/adr/0019-session-auth-argon2-jwt-cookie.md)) are
   deliberately **unprefixed = shared** by the public dev and prod stacks: the
   guard resolves authorization from each stack's own database, so a token
   minted on one stack names a user id the other's DB does not have and is
   rejected there. A real client prod (private repo) always has its own.

   | Secret                   | Content                                                                                                                                  |
   | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
   | `HCLOUD_TOKEN`           | Hetzner Cloud console → project → Security → API tokens → **Read & Write** token                                                         |
   | `CLOUDFLARE_API_TOKEN`   | Cloudflare → My Profile → API Tokens → template "Edit zone DNS", scoped to vikkoch.com                                                   |
   | `TF_API_TOKEN`           | app.terraform.io → User Settings → Tokens (exported as `TF_TOKEN_app_terraform_io` in CI)                                                |
   | `DEPLOY_SSH_PRIVATE_KEY` | Private half of the deploy key from step 1 (dev CD, prod CD and demo-up all use it)                                                      |
   | `DEV_POSTGRES_PASSWORD`  | The dev stack's database password. Must stay **stable across deploys**                                                                   |
   | `PROD_POSTGRES_PASSWORD` | The prod stack's database password (its own volume). Must stay **stable across deploys**                                                 |
   | `ADMIN_EMAIL`            | Login of the bootstrap admin created on every deploy if missing (dev/prod/demo)                                                          |
   | `ADMIN_PASSWORD`         | Its first-boot password, ≥ 8 chars, no `$` (see below). Rotate it in-app after first login                                               |
   | `JWT_SECRET`             | Signs the session JWT (dev/prod; demo generates its own). ≥ 32 chars, **stable across deploys**. Generate one: `openssl rand -base64 48` |
   | `INBOX_PASSWORD`         | Basic-auth password for the dev/demo/public-prod Mailpit reviewer inbox (username `reviewer`)                                            |
   | `GRAFANA_ADMIN_PASSWORD` | Grafana `admin` password on the dev/prod observability stack. Optional — unset skips it                                                  |

   Values landing in a stack's `.env` must contain **no `$`** — Compose reads
   that file for interpolation and would treat `$` as a variable reference.
   `openssl rand -base64|-hex` output is always safe; a hand-picked
   `ADMIN_PASSWORD` is the one to watch. The deploy workflows additionally
   fail fast if `JWT_SECRET` or `ADMIN_PASSWORD` is missing or too short,
   rather than letting the api crash-loop behind a smoke-check timeout.

   Plus Actions **variables** (same page, Variables tab — not secret):

   | Variable          | Content                                                                                                                                                               |
   | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `ACME_EMAIL`      | Let's Encrypt account email Traefik registers with                                                                                                                    |
   | `DEPLOY_HOST`     | Public IP (or DNS name) of the long-lived dev/prod VM, SSH target for CD                                                                                              |
   | `DEV_APP_DOMAIN`  | Hostname of the dev stack (A record → `DEPLOY_HOST`, DNS-only), e.g. b2b-dev.…                                                                                        |
   | `PROD_APP_DOMAIN` | Hostname of the public-prod stack (A record → `DEPLOY_HOST`, DNS-only), e.g. b2b.…                                                                                    |
   | `GRAFANA_DOMAIN`  | Ops hostname for Grafana (A record → `DEPLOY_HOST`, DNS-only). Set this + the `GRAFANA_ADMIN_PASSWORD` secret to turn on central logs (ADR 0016); leave unset to skip |

   Alert mail is **not** configured through CI. Dev and the public prod send
   application mail via Mailpit, which sits in the app stack's network where
   Grafana cannot reach it, so alerting stays dormant there. A deployment with
   real SMTP — the private repo — sets `SMTP_ENABLED`, `SMTP_HOST`, `SMTP_USER`,
   `SMTP_PASSWORD`, `SMTP_FROM` and `ALERT_EMAIL` directly in the stack's
   `observability/.env` (see
   [.env.example](observability/.env.example) and [Alerting](#alerting)).
   Without them Grafana still runs and still evaluates the rules — it just
   cannot mail, so nothing fails to boot.

## Environments & deploys

Two long-lived stacks share the one pet VM (`DEPLOY_HOST`), each with its own
`STACK_NAME` → its own DB volume and domain; the shared Traefik proxy routes both
by `Host` header and one shared observability stack collects both their logs.

- **dev** — auto-deployed on every merge to `main` (`ci.yml` → `deploy-dev`),
  from the sha-pinned images that push just built. Seeded with demo content.
- **public prod** — deployed on pushing a `v*.*.*` release tag (`release.yml` →
  `deploy-prod`), from the promoted **version-tagged** image (byte-identical to
  the sha dev ran). **Never seeded** — it demonstrates the unseeded production
  boot; content would arrive via catalog sync. It is a portfolio demonstration,
  so it keeps the Mailpit reviewer inbox (below) and stays out of search results
  (`SEO_INDEXABLE=false`) — like dev and the demo.

A real **client prod** is a separate, client-owned VM deployed from the private
repo — same `deploy.sh`, its own config and real SMTP, no Mailpit, and
`SEO_INDEXABLE=true` so it is the one stack search engines index.

## Demo workflows

- **demo-up** (manual trigger): terraform apply → wait for cloud-init →
  [deploy.sh](deploy.sh) with a generated `.env` (throwaway DB credentials and
  JWT signing key — nothing outlives the VM — plus the shared `ADMIN_*` secrets
  so a reviewer can sign in; images from GHCR — tag selectable, default `main`).
  The run summary shows the demo URL and names the secrets to log in with —
  never their values, since a public repo's run logs are public. Hostname is `b2b-demo-run<N>` with the workflow run number,
  so every run gets a fresh name (clean DNS, no Let's Encrypt
  duplicate-cert limits).
- **demo-down** (manual trigger + nightly sweeper at 03:00 UTC): terraform
  destroy. The schedule is forget-insurance against an hourly-billed server
  staying up; destroying an empty state is a no-op, so it always runs.

## Email & the reviewer inbox (dev / demo / public prod)

Per [ADR 0013](../docs/adr/0013-email-via-mailer-port-smtp-adapter.md) the api
sends all mail over SMTP, and the dev/demo/public-prod stacks use **Mailpit** as
the sink — no real email leaves. Those deploy workflows pass the
[compose.mailpit.yml](../compose.mailpit.yml) overlay to
[deploy.sh](deploy.sh), which lands it on the VM as `compose.override.yml`
(Compose auto-merges it). That overlay adds the Mailpit service the api targets
(`MAIL_HOST=mailpit`) and exposes its web UI through Traefik as the **reviewer
inbox** at `https://<stack-domain>/inbox/`, behind HTTP basic-auth
(username `reviewer`, password = the `INBOX_PASSWORD` secret; the workflow hashes
it into an SHA1 htpasswd entry at deploy time, never logging the plaintext).

A real **client prod** (private repo) gets no overlay — it ships no Mailpit and
sets `MAIL_*` to a real SMTP provider (see
[.env.stack.example](../.env.stack.example)).

## Alerting

Grafana mails alerts for the three failures that actually end a deployment.
They are provisioned from files alongside the dashboard, and every one is
answered from **logs** — this VM runs no metrics store, deliberately: a
CPU/memory dashboard on a box using ~10% of its RAM would show flat lines, while
the disk quietly fills.

| alert                       | fires when                                             | why it is the one that matters                                                                 |
| --------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Disk above 80%              | a `disk-usage` sidecar reports >80% for 10m            | uploads only grow, backups keep two retention policies, Loki holds 14 days                     |
| Backup job reporting errors | `db-backup`/`media-backup` log an error within an hour | a backup nobody checks is not a backup                                                         |
| Elevated server errors      | >20 responses ≥500 in 10 minutes                       | a page that cannot load its data answers 503, so an outage is visible rather than a silent 200 |

Set `SMTP_*` and `ALERT_EMAIL` in the observability `.env` (see
[.env.example](observability/.env.example)). Disk usage reaches Loki as a log
line every five minutes rather than as a metric, which is what lets a single
log pipeline carry it.

**Prove the channel works once, after configuring it:**

```bash
infra/alert-test.sh <host> prod
```

It reads the VM's own SMTP settings and sends one mail through them, so it
tests the credentials the alerts will actually use. Worth doing because
alerting is silent when it works _and_ silent when it is broken: Grafana logs a
notify error and carries on, so a blocked port or a rejected sender looks
exactly like a quiet week. (Grafana's UI has a **Test** button on the contact
point that does the same thing interactively.)

There is deliberately no "stack started" notification. Anything that mails on
every deploy trains you to ignore it, and an always-firing watchdog alert costs
a mail a day to tell you what one run of the script above already told you.

Two behaviours worth knowing before you tune them:

- **Silence is healthy for two of the three.** No backup errors and no 5xx mean
  no matching log lines at all, so those rules treat "no data" as OK. The disk
  rule does the opposite — silence there means the reporter died, which is worth
  a mail.
- A firing alert re-sends once a day, not once an interval.

## Backups & restore

Long-lived stacks (dev, prod) opt into the `backup` profile via
`COMPOSE_PROFILES=backup` in their `.env`, which starts two sidecars: a nightly
`pg_dump` (ADR 0017) and a media-volume archive (ADR 0028). Both write under
`/srv/b2b/<stack>/backups`, and both live on the same VM as the data they
protect — so getting a copy **off** the box is a separate, deliberate step:

```bash
# take a fresh dump + media archive and download both (plus the stack .env)
infra/backup.sh <host> .env.prod [dest-dir]

# put a matched pair back (destructive; asks for the stack name)
infra/restore.sh <host> .env.prod <dump.sql.gz> <media.tar.gz>
```

The two artifacts must be a **matched pair**, and `backup.sh` takes them in the
right order: database first, media second. Uploads are append-only, so an
archive taken after the dump always contains every image the dump references —
the reverse order restores a catalog whose images 404.

Restore replaces data wholesale: schemas are dropped and rebuilt, the media
volume is emptied and refilled. Rehearse it against a throwaway stack before
you need it against a real one.

## Admin access (every environment)

Per [ADR 0019](../docs/adr/0019-session-auth-argon2-jwt-cookie.md) each stack
runs a `bootstrap-admin` one-shot on every `up`, **before** the api starts: it
creates the `ADMIN_EMAIL` account with an argon2id hash of `ADMIN_PASSWORD` if —
and only if — that account does not exist yet. So:

- every environment, including an unseeded prod, comes up with a usable admin,
  with no manual step;
- a redeploy **never** clobbers an admin whose password was rotated in-app, so
  the deploy-time `ADMIN_PASSWORD` is a first-boot value only. Changing the
  secret later has no effect on a stack that already ran the one-shot — reset
  such an account in the database, not by redeploying;
- the plaintext lives in the stack's `.env` on the VM and in the short-lived
  one-shot's environment. `ADMIN_PASSWORD_HASH` is the documented hardening if
  that is unacceptable for a given deployment (ADR 0019).

Sessions are JWTs signed with `JWT_SECRET` and carried in an httpOnly cookie.
Keep it stable across deploys: changing it invalidates every open session (which
is also the emergency "log everyone out" lever). The ephemeral demo generates a
fresh one per run, since no session outlives the VM.

## Running Terraform locally

```sh
cd infra/demo
terraform login                # once; stores the HCP token
export HCLOUD_TOKEN=...
export CLOUDFLARE_API_TOKEN=...
terraform init                 # commit the generated .terraform.lock.hcl
terraform apply -var demo_id=local1
terraform destroy -var demo_id=local1
```

One demo instance exists at a time (single `b2b-demo` workspace): applying
with a new `demo_id` while one is up re-points the existing server/DNS rather
than creating a second one.

The Terraform **state contains every resource attribute in plaintext** — it
lives only in HCP Terraform, never in git or workflow artifacts.

## Manual setup without Terraform

The Terraform demo automates exactly four things; on any VPS provider you can
do them by hand (VM must meet the [requirements](#vm-requirements) above):

1. **Create the VM** from an Ubuntu LTS image and paste
   [cloud-init.yml](cloud-init.yml) into the provider's _user data_ /
   _cloud-init_ field at creation time (every major provider has one), with the
   `REPLACE_WITH_…` placeholder swapped for your deploy public key. The VM
   boots fully bootstrapped.
   _Already-running VM?_ cloud-init only executes at first boot — instead run
   the `runcmd` steps from the file manually over SSH and create the `deploy`
   user with the same key.
2. **Firewall**: allow inbound TCP 22, 80, 443 (and ICMP if you want ping) in
   the provider's firewall / security group. Host-level iptables is already
   handled by cloud-init for images that ship restrictive defaults.
3. **DNS**: an A record for your hostname → the VM's public IP. If the zone is
   on Cloudflare, keep it **DNS-only (grey cloud)** — Traefik obtains its own
   Let's Encrypt certificates via HTTP-01, which the Cloudflare proxy would
   break.
4. **Deploy**: run [deploy.sh](deploy.sh) (the same script the workflows use):

   ```sh
   SSH_OPTS="-i /path/to/deploy-private-key" \
     infra/deploy.sh <host> <app-env-file> infra/traefik/.env
   ```

   For a non-prod stack, append `compose.mailpit.yml` to add the Mailpit sink +
   reviewer inbox (and set `MAIL_*`/`INBOX_BASICAUTH` in the env file), and set
   `SEED=1` to load demo content (prod leaves it unset — see below):

   ```sh
   SSH_OPTS="-i /path/to/deploy-private-key" SEED=1 \
     infra/deploy.sh <host> <app-env-file> infra/traefik/.env compose.mailpit.yml
   ```

   It SSHes as `deploy`, copies the [shared Traefik stack](traefik/) and the
   app stack (root [compose.yml](../compose.yml) + the given env file, derived
   from [.env.stack.example](../.env.stack.example)) into `/srv/b2b/`, brings
   both up, runs the one-shot `seed` service **only when `SEED` is set**
   (idempotent upsert — off by default so prod is never seeded by accident), and
   smoke-checks `https://$APP_DOMAIN` (incl. a seeded API page when seeded). Stacks land
   in `/srv/b2b/<STACK_NAME>/`, so one VM can host several (dev / prod / demo).

   Images are pulled from GHCR. To deploy before CI has published any (or to
   test unmerged builds), preload local images under the tags your env file
   references — never push workstation builds to the registry:

   ```sh
   docker save IMAGE:TAG ... | gzip | ssh deploy@<host> 'gunzip | docker load'
   ```
