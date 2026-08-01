# 0029 — Attribute bundled dependencies from the build's own notice file, and gate production licenses in CI

**Status:** accepted · **Date:** 2026-08-01

## Context

The platform ships hundreds of npm packages (NFR-LEGAL-06). Two obligations
follow from that, and they are not the same obligation:

**Attribution.** Permissive licenses (MIT, BSD, Apache-2.0) require their notice
and copyright lines to travel with _distributed_ copies of the software. The
API is never distributed — visitors reach it over HTTP, which no permissive
license treats as distribution — so its dependencies carry no attribution duty.
The browser bundle is a different matter: every visitor downloads a copy, and
the MIT-licensed code inside it is distributed to them. Low-stakes in practice,
trivially satisfiable, and a client deployment should not be the one place the
clause is quietly ignored.

**Copyleft exposure.** A GPL/AGPL/SSPL package reaching production is a real
problem for a closed client deployment, and one nothing currently notices: it
arrives as a transitive dependency of a dependency and never announces itself.
This is the risk worth engineering against; attribution is the paperwork.

For attribution the obvious approach — generate a notice file with a license
scanner, commit it, and have CI regenerate or verify it on every PR — was
rejected. It puts a large generated artifact under review, churns on every lock
file change, and its package list is an _approximation_ of the bundle derived
from the dependency graph rather than from what was actually shipped.

## Decision

- **Attribution comes from the build.** Angular's `extractLicenses` (on for
  production configurations) already writes `3rdpartylicenses.txt` covering
  exactly the packages esbuild put in the bundle. The SSR tier serves it at
  `/licenses.txt`; a lazy `/licenses` route fetches, parses and renders it.
  Nothing is generated into the repository and no CI step keeps it fresh.
- `/licenses` is a **code route, not a `Page` slug** (ADR 0027): its content is a
  build artifact, so there is no page row to publish and nothing for an admin to
  edit. It is linked through `pages.footerNav` like any other nav entry, so a
  deployment whose jurisdiction does not require the notice simply omits it —
  the route stays reachable, it just stops being advertised.
- **`tools/check-licenses.mjs` fails CI** on any package in the production
  dependency tree (`npm ls --omit=dev`) whose license is outside an allowlist of
  permissive SPDX ids, with a small map of reviewed exceptions carrying their
  reasoning.

## Rationale

Deriving the page from the bundler's output makes the bundler the single source
of truth. The notice cannot go stale, cannot list a package the build did not
ship, and cannot omit one it did — properties a scanner over `package.json`
files can only approximate. Serving it as a file rather than compiling it in
also keeps ~140 kB of legal text out of every visitor's JavaScript.

The cost is that the page has no content in development builds, where license
extraction is off. That is stated on the page rather than hidden, and the smoke
test — which runs against real production images — is where the wiring is
verified end to end.

The policy gate is scoped to production dependencies because dev tooling is
never distributed and its licenses therefore do not bind us. The scope
deliberately over-approximates the browser bundle: it includes server-only
packages, which is the safe direction to be wrong in. Exceptions are per package
with a written reason (sharp's LGPL libvips, used unmodified and server-side
only; `caniuse-lite`'s CC-BY-4.0 dataset), so accepting one is a decision a
reviewer sees rather than a line in an allowlist.

## Consequences

- (+) The attribution page is always exactly the shipped bundle, with no
  generated file in the repository and no freshness check to maintain.
- (+) A copyleft dependency fails the PR that introduces it, when it is still
  cheap to drop, instead of at some later legal review.
- (−) The `/licenses` page is empty in development and in `nx serve`; only
  production builds carry the notice file.
- (−) The parser is coupled to the Angular build's notice format. It is
  deliberately forgiving, and a format change degrades the page rather than
  losing entries, but it is a coupling.
- (−) Server-side dependencies get no attribution page. That is the intended
  reading of the licenses, not an omission — revisit it if any part of the API
  is ever distributed as a binary or an image handed to a third party.
