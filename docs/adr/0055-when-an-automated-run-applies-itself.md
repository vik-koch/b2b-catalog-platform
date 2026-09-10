# 0055 — Let an automated run apply itself only within a declared policy

**Status:** accepted · **Date:** 2026-09-10

## Context

ADR 0026 made every sync a **staged run**: parse, validate, diff, persist, and
then a separate commit applies it in one transaction. A person stands between
those two halves and looks at the preview. FR-ADM-07 keeps that structure for
the automated feed — same run, same preview, same audit record — which leaves
one question the requirement does not answer: does an unattended run commit
itself?

It cannot always. A price-and-stock feed running every fifteen minutes is
worthless if it waits for a human, and the whole point of iteration 12 is that
those figures stop being typed. But the same endpoint can also carry a run that
soft-deletes half the catalog because an export was filtered wrongly, or creates
four hundred products because a key column moved.

Alternatives considered: always auto-commit and rely on the delete gate;
never auto-commit and have the admin approve everything; a per-token flag;
approving by field set rather than by effect.

## Decision

- **A run applies itself when its effect is within the deployment's declared
  policy, and is otherwise staged.** The policy is deployment config: a ceiling
  on creates, a ceiling on soft-deletes (zero being a reasonable value), and a
  ceiling on the share of the catalog a single run may change.
- **A staged run is work awaiting the admin** (FR-WORK-02) and links to the
  same preview a manual upload produces. It is committed or discarded by hand.
- **An adapter may stage a run it could otherwise have committed**, by saying
  so on the submission. It does this when it cannot fully vouch for what it
  parsed — an unrecognised source-format version being the case this exists
  for.
- **Nothing auto-commits a deletion the caller did not claim authority for.**
  ADR 0026's gate is unchanged and comes first: `softDeleteMissingProducts`
  still requires `productSetAuthoritative`, and the policy applies on top.
- **A staged run has three endings, and waiting is not one of them.** It is
  applied, or superseded by the next run from the same source, or discarded by
  an admin who decided against it. Both of the last two stay in the log as
  never-applied, told apart because they are different sentences: the run was
  overtaken, or somebody said no to it.

## Rationale

**Judging a run by its effect rather than by its shape is the only test that
generalises.** A field whitelist says what a run _may_ touch, which is a
statement about intent; a diff says what it _will_ do, which is the thing worth
a human's attention. The same reasoning already chose authority over field-set
size for the deletion gate in ADR 0026 — this is that argument applied to the
commit rather than to the sweep.

**Thresholds are config because the right numbers are a property of the
catalog**, not of the software. A shop adding two products a week and one
importing a seasonal range have different ideas of a suspicious run, and
neither should need a release to say so.

**Letting the adapter ask to be doubted** costs one boolean and removes a whole
class of bad outcome. An adapter that meets a version, a currency or a
structure it does not recognise has two unattractive options — refuse, which
turns an upgrade on the source system into an outage here, or proceed, which
mis-imports a catalog silently. Staging is the third: the feed keeps running,
nothing is applied, and a person sees exactly what it would have done. The
platform does not need to know _why_ the adapter is unsure, which keeps the
format out of this repository (ADR 0054).

**Superseding rather than queueing** matches what a staged run is: a snapshot of
a diff that was true when it was taken. Two-hour-old previews from a
fifteen-minute feed are not a backlog to work through, they are noise, and the
newest one is the only one worth applying. Discarding exists for the other
direction: without it the only way a run leaves the queue is the next one
arriving, and work awaiting an admin that they cannot themselves clear is a
count they stop reading.

## Consequences

- (+) The frequent, boring case — prices and stock moved a little — is fully
  unattended, which is what the iteration is for.
- (+) The catastrophic case is caught by the mechanism that already existed,
  rather than by a new safety net: it lands in the preview an admin already
  knows how to read.
- (+) An upgrade to the source system degrades to "somebody looks at the next
  run" instead of either silence or a stopped feed.
- (−) An admin can still commit a bad run by clicking through the preview. The
  policy buys attention, not correctness, and nothing here claims otherwise.
- (−) Two runs can be staged for different reasons — over policy, or the
  adapter's own doubt — and the screen has to say which, or the admin cannot
  tell an ordinary large import from one whose parsing is suspect.
- (−) Thresholds set too tight produce a standing queue of staged runs that
  nobody reads, which is worse than none. The defaults ship deliberately loose
  and are tightened once a deployment knows its own noise.
