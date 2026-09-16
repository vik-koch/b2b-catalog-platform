# 0060 — Give a run an area, not a second set of machinery

**Status:** accepted · **Date:** 2026-09-16

## Context

Until now an exchange meant the catalog. FR-ADM-11 adds customers and
FR-ADM-08 will add orders, so what was one feed becomes three — each with its
own rows, its own owner (FR-ADM-10) and its own readers (FR-ADM-09), while
sharing everything that surrounds a run: the staged/applied lifecycle and why a
run was staged (ADR 0055), the actor or token behind it, the counts, the audit
record, the state-change notifications (ADR 0057) and the work-awaiting figure
(FR-WORK-02).

The catalog half of this shipped in v1.10.0 and is being written against: an
adapter is already submitting to `POST /machine/sync/runs`, and staged-run
links have already been mailed to people.

Alternatives considered: a table, a contract and a screen per area; one log
screen with an area filter; moving the machine endpoints under a per-area path.

## Decision

- **One `sync_runs` table with an `area` column**, one run contract with an
  `area` field, and one run page serving every area. Only the row payload and
  the owned-field list differ per area, and those already live in the contract
  layer.
- **One log screen per area, at its own slug** (`/admin/sync/catalog`,
  `/admin/sync/customers`), each behind the guard that matches its readers —
  and the same for the work-awaiting count, which becomes one queue per area.
- **The run's own page keeps `/admin/sync/runs/:id`** and is reached without
  naming an area; the area is read off the run and checked against the reader.
- **The machine paths do not move.** The area travels in the body, where the
  per-run intent already travels.

## Rationale

**A second table would be a copy of the first with one word changed.** Nothing
about a run's lifecycle is catalog-specific; what is specific is what it
carries. Splitting the table would fork the lifecycle three ways and leave
every later change to it — a new status, a new staged reason — to be made three
times and to drift twice.

**Readership, not shape, is what differs, so that is what the screens split
on.** A manager may do a customer's work by hand and may not touch the catalog,
so a single log with a filter would open on rows half its readers are refused,
and a single staged-runs count would show a manager work they cannot finish. A
count that links somewhere its reader may not go is worse than no count
(ADR 0046).

**The run page is one screen because a run id already names its area.** Putting
the area in that path would buy a tidier URL and break a link somebody has
already been sent. The same argument decides the machine endpoint, with more
force: renaming it would be a major version under ADR 0044 — a port contract
breaking — for cosmetics, and the adapter being written against it today is the
thing the versioning rule exists to protect.

**Areas are a closed set in code, not deployment data.** An area is a rule
about who may write which column and who may read which log; a new one arrives
with the exchange that needs it, not with a config key.

## Consequences

- (+) An area is a value, not a mechanism: the customer exchange inherits the
  staging policy, the audit trail, the notifications and the counts on the day
  it ships, and orders will inherit them again.
- (+) Nothing already deployed moves. The adapter keeps its endpoint, mailed
  links keep working, and the migration is one column with a default.
- (−) Two screens now render from one component, so a change to the log has to
  be read twice — once as the catalog's and once as the customers'.
- (−) The per-area readership rule is enforced in the handler rather than by
  the route's guard, because it is a fact about the run and not about the
  route. It is written as a role→areas table for the reason the work counts are
  (ADR 0046): a role that names no area is refused, which is the safe direction
  to fail in.
- (−) `sync_runs` will hold rows whose `rows` payloads have different shapes.
  The column is already `jsonb` and already per-run-contract-typed, so this is
  a widening rather than a new problem — but it does mean the table cannot be
  read without knowing the area.
