# 0003 — One Nx monorepo for both apps and shared code

**Status:** accepted · **Date:** 2026-07-17

## Context

The system has an Angular frontend, a NestJS backend, e2e suites, and
contracts shared between them (DTOs, the catalog sync import shape — an
API surface that must stay stable across versions). One developer
maintains all of it. Alternatives: separate repos per app, or one repo
with plain npm workspaces and per-app CLIs.

## Decision

A single Nx monorepo containing both apps, their e2e projects, and shared
libraries — possible because the stack is TypeScript throughout (0002).

## Rationale

1. **Shared contracts are compile-checked.** DTOs and the sync import
   shape live in a shared library; a breaking change fails the build of
   both consumers instead of surfacing at runtime across repos.
2. **Cross-cutting changes are atomic.** One branch, one PR, one CI run
   covers a feature that touches API, frontend, and contract — with
   trunk-based development this keeps every merge deployable.
3. **Nx over plain workspaces** for the task graph: cached targets,
   consistent generators, and affected-only runs available once the
   repo grows (CI currently runs everything — it is small enough).

Separate repos would only pay off with independent teams or release
cadences; here everything ships together anyway.

## Consequences

- (+) Contract drift between frontend and backend is impossible to merge.
- (+) One toolchain, one dependency tree, one CI pipeline.
- (−) Nx adds its own concepts and upgrade cadence on top of the Angular
  and Nest CLIs — tooling knowledge a contributor must acquire.
- (−) Repo-wide dependency upgrades affect everything at once; there is
  no per-app isolation to hide behind.
