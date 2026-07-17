# 0006 — Ephemeral Terraform demo, manually created long-lived VM

**Status:** accepted · **Date:** 2026-07-17

## Context

The public demo must prove the provisioning and deployment path
end-to-end (NFR-OPS-01) at near-zero cost. Hetzner Cloud bills hourly and
is Terraform-friendly; Oracle's Always Free tier is permanently free but
its capacity is scarce — an instance, once obtained, should never be
destroyed. Alternatives: Terraform-manage every host uniformly, or a
single permanent demo server.

## Decision

Two hosting roles on one shared bootstrap (`infra/cloud-init.yml`):

- **Ephemeral demo** on Hetzner — created and destroyed entirely by CI
  (`demo-up`/`demo-down`, nightly sweeper as forget-insurance), Terraform
  state in HCP Terraform, a fresh `b2b-demo-<run>` hostname per run.
- **Long-lived VM** (dev + prod stacks) on Oracle Always Free — created
  manually once, bootstrapped from the same cloud-init, then only ever
  targeted by application deploys.

## Rationale

1. **The demo proves the automation capability** NFR-OPS-01 asks for:
   one click to a browsable TLS URL on a fresh server. Cost per run is
   cents; a permanent demo server would cost continuously and rot.
2. **The long-lived VM is a deliberate pet** — purely a cost decision:
   Always Free capacity is grabbed once and must not be recreatable by a
   careless `destroy`. Keeping it out of Terraform state is the safety,
   not a limitation. Application deploys to it remain CI/CD-only.
3. **Fresh hostname per demo run** sidesteps DNS caching and Let's
   Encrypt duplicate-certificate limits, and makes runs independent.

## Consequences

- (+) Hosting cost ≈ 0; disposable, always-fresh client demos.
- (+) Provisioning drift surfaces in the demo pipeline, not in prod.
- (−) Two providers and two architectures (Hetzner x86, Oracle ARM) —
  images must be multi-arch (see 0007).
- (−) The pet VM needs what pets need: a provisioning runbook and real
  backups (NFR-OPS-04); it is the one host that cannot be rebuilt by CI.
