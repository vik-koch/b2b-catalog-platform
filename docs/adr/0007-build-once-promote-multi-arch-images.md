# 0007 — Build once, promote by digest, multi-arch images

**Status:** accepted · **Date:** 2026-07-17

## Context

Trunk-based development with strict semver: merge to `main` deploys dev,
a version tag deploys prod. Deploy targets span x86 (Hetzner demo) and
ARM (Oracle Always Free) — a consequence of cost-driven hosting (0006).
The in-image Nx build is too slow under QEMU emulation. Alternatives:
rebuild images on release tags; single-arch images per host; emulated
multi-arch builds.

## Decision

CI on `main` builds each image natively per architecture (amd64 + arm64
runners), pushes by digest, and merges one multi-arch manifest tagged
`:main` and `:sha-<sha>`. The release workflow does not build at all: it
re-tags the existing `sha` manifest as `:X.Y.Z` and `:latest`. Hosts pull
their native variant from GHCR (public packages, no registry login).

## Rationale

1. **Prod ships byte-identical bits to what dev ran.** Promotion by
   digest makes "it was tested" a guarantee, not a convention — and a
   tag pointing at a commit that never passed CI on `main` fails loudly,
   because no `sha` image exists to promote.
2. **Native runners** keep build times sane where QEMU would crawl, at
   the cost of a digest/manifest merge step.
3. **Multi-arch manifests decouple hosting from architecture** — any
   current or future host pulls the same tag.

## Consequences

- (+) Releases are instant and cannot ship untested code.
- (+) Host architecture is a non-decision from here on.
- (−) The build workflow is more involved (per-arch digest artifacts,
  manifest merge) than a single `docker build`.
- (−) `:latest` exists only after the first release; pre-release deploys
  must reference `:main` or a `:sha-*` tag explicitly.
