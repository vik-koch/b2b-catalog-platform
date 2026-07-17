# 0002 — Angular, NestJS and PostgreSQL as the stack

**Status:** accepted · **Date:** 2026-07-17

## Context

0001 decided to build custom — which raises the stack question. The usual
external drivers are absent here: the client has no developers whose
skills must be matched and no existing software estate to integrate with.
The system is maintained long-term by a single developer. Candidates in
the same class: React/Next.js or Vue/Nuxt on the frontend; Express,
Fastify, or a non-TypeScript backend (Spring, Laravel, …); MySQL or a
document store for persistence.

## Decision

Angular + NestJS + PostgreSQL, TypeScript throughout.

## Rationale

1. **Maintainer expertise is the primary driver — stated plainly.** With
   no client-side constraints, the dominant project risk is delivery and
   long-term maintenance by one person; the stack that person has recent,
   hands-on experience with minimizes that risk. Team skill is a standard
   first-order architecture driver; here the team is one developer.
2. **One language end-to-end.** TypeScript across all layers means one
   toolchain, one set of idioms to stay current in, and the shared
   compile-checked contracts that 0003 builds on.
3. **Opinionated frameworks suit a solo, long-lived codebase.**
   Convention replaces the ecosystem-assembly decisions a React/Express
   stack would demand — fewer choices to make, document, and defend.
4. **PostgreSQL is the boring default.** Orders, accounts, and tier
   pricing are relational; built-in full-text search covers the catalog
   without extra infrastructure (its own ADR when search is built).

Concession: no functional requirement discriminates between these
frameworks — React/Vue with any mature backend would serve equally well.
This decision is about the maintainer, not the technology; with different
staffing it would read differently.

## Consequences

- (+) Lowest delivery and maintenance risk available for this team of one.
- (+) One mental model and one language across the whole system.
- (−) Angular's mindshare is smaller than React's — a future maintainer
  or hiring scenario has a thinner candidate pool.
- (−) Framework major-version cadence (Angular's in particular) is a
  recurring upgrade duty owned by one person.
