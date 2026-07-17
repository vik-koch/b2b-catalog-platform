# 0004 — Deploy with Docker Compose on a single VM

**Status:** accepted · **Date:** 2026-07-17

## Context

The whole system is a handful of containers (web, api, postgres, proxy)
serving a few-hundred-SKU shop; NFR-OPS-01/-02 require CI/CD deployments
and separate dev/prod environments (why the separation exists at all is
discussed in 0005), not high availability. Alternatives:
a self-hosted PaaS layer (Coolify, CapRover, Dokploy), Docker Swarm, or
Kubernetes (managed or self-run).

## Decision

Plain Docker Compose: one committed compose file per stack role, deployed
over SSH by CI (`infra/deploy.sh`); VM provisioning via Terraform and
cloud-init (see 0006).

## Rationale

1. **The need is exactly "N containers on one VM with restart policies"**
   — which is precisely what Compose expresses, declaratively, versioned
   and reviewable in git. The same files run the stack locally.
2. **A PaaS layer** (the most realistic alternative at this scale) would
   add a management plane with its own update surface, and moves deploy
   configuration into UI state outside of git — while replacing what is
   here a ~60-line deploy script.
3. **Swarm** adds orchestration that only pays off with multiple nodes;
   **Kubernetes** additionally brings an operational burden and resource
   overhead (on a 4 GB VM) that nothing in the requirements justifies —
   there is no HA requirement and the scale ceiling is known and low.

Concession: with multiple nodes or real availability requirements,
Kubernetes becomes the right answer; this design's ceiling is one VM per
deployment, accepted deliberately.

## Consequences

- (+) The entire deployment surface is a few files in git plus SSH — no
  platform to operate, understandable in one sitting.
- (+) Dev/prod parity: local, demo, and production run the same stack.
- (−) Deploys restart containers (brief downtime); no rolling updates,
  no self-healing beyond `restart: unless-stopped`.
- (−) Vertical scaling only; outgrowing one VM means revisiting this ADR.
