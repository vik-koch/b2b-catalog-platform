# 0068 — Simulate the demo shop's back office as a client of the machine API

**Status:** accepted · **Date:** 2026-10-23

## Context

The English demo shop is meant to show a catalog, customers and orders owned by
a source system (FR-ADM-07, FR-ADM-08, FR-ADM-10, FR-ADM-11). Without one, the
three exchanges are only documentation: no demo stack has anything on the other
end of the machine API, and the real adapter is private. The demo needs a back
office that behaves like one, on a schedule, without becoming something to
maintain.

Two questions came with it. Where the back office's state lives, given that a
demo stack is reset to its seed bundle (0012, amended). And whether the demo
should start again on a timer — a week, say — which the simulator itself could
only do with the Docker socket: stopping the api, dropping the schema and
running the migrate one-shot are host operations.

## Decision

A small public app, `apps/erp-sim`, runs on a demo stack whose seed bundle has a
`simulation.json`. It uses nothing but the documented machine API, over the
stack's own network, with a token the seed stores from a secret. It keeps no
state: what it sends follows from the bundle, `simulation.json` and the nights
since the last reset. It runs continuously; the stack is reset only by
`infra/reset.sh` — when a deploy changes what the stack loads, or when someone
asks for it — which stops the simulator before the reset and starts it after.

## Rationale

- **A client, not a back door.** Driving the same routes an ERP adapter would
  makes the simulator a working, minimal reference client in the public repo,
  and it can do nothing the API would not let a real source system do.
- **No state, so nothing to lose.** The bundle is the back office's own
  records, and each night is drawn from a generator seeded with that night's
  number. A restarted container sends exactly what it would have sent, a night
  missed while it was down is sent when it is back, and sending a night twice
  is a run that changes nothing. A state file was the alternative; it would
  have needed a volume, a reset of its own and a story for when it and the
  shop disagree.
- **A stock that holds its shape.** Products sell a share of their stock each
  night and are reordered below a threshold, the delivery arriving a few nights
  later — how a back office keeps stock, and the only shape that stays
  plausible for months: a random walk with top-ups drifted until most of the
  catalog read "few left" within a quarter.
- **Bounded growth.** New articles come from a short pool in `simulation.json`,
  one every few nights, and arrive unpublished for the shop to complete. The
  simulator cannot see what the shop has published — the catalog exchange is
  inward only — so the pool, not a look at the catalog, is what keeps
  unpublished articles from piling up.
- **Continuous, not on a timer.** The orders and registrations a demo starts
  with are answered in its first days; after that the back office answers
  whatever visitors place, as a real one would. A timed reset would add a host
  timer, and the simulator doing it would need the socket, which is root on the
  VM — with a trigger page planned for reviewers, a public route one step from
  it. Releases reset the shop often enough, and _Reset to seed_ does it by hand.
- **Narrow writes.** The nightly catalog run writes stock and nothing else for
  the products the shop already has (`fields: ["stock"]`, no prices, nothing
  restored), so it cannot clobber what the shop edits while it holds the
  catalog itself.
- **The shop may take an area back.** A write refused because the area is not
  owned is logged and skipped, never reported as a failure — the shop would be
  mailed that its feed broke when an operator only flipped a switch.

## Consequences

- (+) The exchanges can be watched working on the demo, and the code doubles as
  the smallest example of an adapter.
- (+) Everything the simulator sends is reproducible from three files and a
  date.
- (−) A run that moves stock touches a large share of a small catalog, so the
  English shop's change-share ceiling is 1 — as a real feed's, which may
  rewrite every price in one run, has to be anyway.
- (−) A new simulator build starts the history again: it is part of the hash a
  reset records, so changing it resets the shop.
- (−) What visitors leave behind stays until the next reset; the platform's own
  retention sweep is what clears the personal details from their orders.
