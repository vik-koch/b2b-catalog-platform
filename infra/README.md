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

- **2 vCPU / 4 GB RAM, ≥ 40 GB disk** — sized for one compose stack
  (Postgres + API + SSR + Traefik); the Hetzner `cx23` used by the demo is
  exactly this. Add headroom if you run several stacks on one VM.
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

   | Secret                  | Content                                                                                   |
   |-------------------------|-------------------------------------------------------------------------------------------|
   | `HCLOUD_TOKEN`          | Hetzner Cloud console → project → Security → API tokens → **Read & Write** token          |
   | `CLOUDFLARE_API_TOKEN`  | Cloudflare → My Profile → API Tokens → template "Edit zone DNS", scoped to vikkoch.com    |
   | `TF_API_TOKEN`          | app.terraform.io → User Settings → Tokens (exported as `TF_TOKEN_app_terraform_io` in CI) |
   | `DEMO_SSH_PRIVATE_KEY`  | Private half of the deploy key from step 1                                                |
   | `DEV_POSTGRES_PASSWORD` | The dev stack's database password. Must stay **stable across deploys**                    |

   Plus Actions **variables** (same page, Variables tab — not secret):

   | Variable         | Content                                                                     |
   | ---------------- | --------------------------------------------------------------------------- |
   | `ACME_EMAIL`     | Let's Encrypt account email Traefik registers with                          |
   | `DEV_HOST`       | Public IP (or DNS name) of the long-lived dev/prod VM, SSH target for CD    |
   | `DEV_APP_DOMAIN` | Hostname of the dev stack (A record → `DEV_HOST`, DNS-only), e.g. b2b-dev.… |

## Demo workflows

- **demo-up** (manual trigger): terraform apply → wait for cloud-init →
  [deploy.sh](deploy.sh) with a generated `.env` (throwaway DB credentials,
  images from GHCR — tag selectable, default `main`). The run summary shows
  the demo URL. Hostname is `b2b-demo-run<N>` with the workflow run number,
  so every run gets a fresh name (clean DNS, no Let's Encrypt
  duplicate-cert limits).
- **demo-down** (manual trigger + nightly sweeper at 03:00 UTC): terraform
  destroy. The schedule is forget-insurance against an hourly-billed server
  staying up; destroying an empty state is a no-op, so it always runs.

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

   It SSHes as `deploy`, copies the [shared Traefik stack](traefik/) and the
   app stack (root [compose.yml](../compose.yml) + the given env file, derived
   from [.env.stack.example](../.env.stack.example)) into `/srv/b2b/`, brings
   both up, and smoke-checks `https://$APP_DOMAIN`. Stacks land in
   `/srv/b2b/<STACK_NAME>/`, so one VM can host several (dev / prod / demo).

   Images are pulled from GHCR. To deploy before CI has published any (or to
   test unmerged builds), preload local images under the tags your env file
   references — never push workstation builds to the registry:

   ```sh
   docker save IMAGE:TAG ... | gzip | ssh deploy@<host> 'gunzip | docker load'
   ```
