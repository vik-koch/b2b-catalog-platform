# 0056 — Make external ownership an operator switch with an area, not two toggles

**Status:** accepted · **Date:** 2026-09-10

## Context

Two requirements asked for the same thing in different words. The catalog needs
the manual bulk upload refused, and the fields the feed writes made
uneditable, while an external system owns them — otherwise the platform has two
writers for one column and the last one to run wins. Order processing needed
(as the deleted FR-ORD-06 put it) the platform's own transitions turned off
while an external system owned them, and turned back on when that system was
unavailable. Both are the same sentence: _while something outside owns this
area, the ways in from inside are closed, and an operator can reverse that
without a deploy._

This also resolves what read as a contradiction in the iteration-12 plan: the
manual upload is the operator's fallback when the feed breaks, and it is also
the second writer that must not exist while the feed runs.

Alternatives considered: a deployment config key; two independent runtime
flags; inferring ownership from whether an adapter has ever called; making the
admin panel merely discourage editing rather than the API refuse it.

## Decision

- **One runtime setting, `FR-ADM-10`, with an area.** Areas are a closed set —
  `catalog` now, `orders` in iteration 13. Each is independently on or off.
- **While an area is owned:** the fields that system writes are refused by the
  API and read-only in the admin panel, and the platform's own way in is
  refused — the manual bulk upload for `catalog`, the staff transitions for
  `orders`.
- **While it is not owned:** the automated exchange for that area is refused
  instead, so the two writers are never both open.
- **Which fields an area owns is stated once**, in shared code, and consumed by
  the write path, the admin editor and the sync engine, so the three cannot
  disagree.
- **A write is a _change_, not a mention.** The admin contract takes a whole
  entity per save, so an owned field arrives on every request whether or not
  anybody touched it. The rule compares the save against what is stored and
  refuses the fields that moved.
- **Creating and removing are refused outright**, for products: both write
  every owned field at once, identity included, so there is nothing to compare.
  Publication is not affected — what the shop shows is not what it stocks.
- **Categories are the asymmetric case.** Only a category's name and key are
  owned. Creating and deleting categories stays open, and so does the whole
  presentation overlay — nickname, parent, order, picture, description — which
  is what keeps the tree rearrangeable under an exchange that says only which
  leaf a product hangs on. The one exception is deleting a _populated_
  category, which reassigns its products and is refused: an empty one still
  deletes.
- **Price lists keep only their key.** A customer tier's key is what a price
  column addresses (`price:<key>`), so it is frozen for the reason `sourceId`
  is. Its name and its place in the list are not: no exchange carries them.
  Adding a price list and removing an unused one stay open — adding is how an
  admin answers a run that priced a key this deployment does not have, without
  handing the catalog back first, and it writes no price, so there is nothing
  for two writers to contend over.
- **It is a rule, not a disabled input.** The refusal lives in the API; the
  greying-out explains it before it is hit.
- **Admin only, effective immediately, and recorded** — with maintenance mode,
  in a runtime-settings history the switch's own page shows.

## Rationale

**One mechanism because it is one idea.** Two toggles for the same sentence
would have meant two settings screens, two ways to be half-switched, and a
second implementation to keep honest. Giving the switch an area means iteration
13 adds a value, not a mechanism.

**Runtime, not config**, for the reason maintenance mode is (ADR 0023): the
moment it is needed is the moment the exchange is broken, and recovery must not
require an operator with deploy access.

**Refused by the API, not discouraged in the UI**, because a guard fails closed
and a handler fails open. A greyed field is a courtesy to the person; the
refusal is the invariant, and the same rule has to hold for a request the admin
panel did not make.

**Compare-and-refuse, over silently ignoring the owned fields.** Ignoring them
would never produce a false refusal, and that is exactly its problem: an admin
who did change a price would be told nothing and would believe it took. The
cost of comparing is a genuine one — if the exchange moves a price between the
moment the editor loads and the moment it saves, an admin who edited only the
description is refused and must reload. That is the correct half of the trade.
The alternative accepts their stale copy over the exchange's newer one, which
is the two-writer problem the switch exists to remove, arriving by a side door.

**Mutual exclusion in both directions** is what makes the fallback coherent. If
manual and automated writes were both accepted, "the feed overwrote what I
typed" becomes a support case with no answer. Closing whichever side is not in
charge means the answer is always the switch, and the switch is one click.

**Recorded beside maintenance mode rather than in the sync log.** The run log
is a log of _runs_; a switch flip is not one, and giving it a row there would
mean a run with no rows, no plan and a status that is not a status. It is also
not only about the catalog: the same table records maintenance mode, whose only
trail until now was a single "who last changed a setting" stamp on a singleton
row — ambiguous the moment that row held two settings.

**Maintenance mode needed no change to sit beside this.** FR-ADM-04 has only
ever gated the public storefront and its read APIs, so a machine run already
populates a deployment that has not opened yet — which is exactly how a new
deployment should be filled.

## Consequences

- (+) The manual upload stays a first-class mode rather than being retired
  behind a flag, and the recovery path when a feed breaks is a documented click
  rather than a deploy.
- (+) A column has exactly one writer at any moment, which removes a whole class
  of "who changed this" question from the sync log.
- (+) Iteration 13 inherits the mechanism; FR-ORD-06 needed no separate build.
- (−) An admin who turns ownership off to correct one product has turned the
  feed off for the whole catalog until they turn it back on. A per-product or
  per-field override was considered and rejected as more state than the problem
  has: the correction is minutes long, and a forgotten switch is visible in the
  admin panel and in the history beneath it.
- (−) An automated client's **failure reports** are refused along with its runs
  while the catalog is not owned, so an operator who takes the catalog back
  loses the record of the feed still being broken. Accepted deliberately: they
  took it back _because_ it is broken, and a client told plainly that the
  platform is not listening beats one quietly filling a log nobody asked for.
- (−) A run staged before the switch moved cannot be applied after it. Applying
  is the write, so it is judged by the setting in force at that moment, not the
  one in force when the file went up.
- (−) The owned-field list is shared code, so extending what the exchange writes
  is a release. That is intended — it is the same list the import contract's
  field whitelist is built from, and the two must not drift.
- (−) The API end-to-end suite now runs **one file at a time**. It shares a
  single API process, and a spec that hands the catalog over changes the answer
  for every catalog write in every other file. The suite could instead have left
  the switch untested, as it leaves the maintenance gate — but that stopped
  being defensible once the machine sync route only works while the catalog _is_
  owned. Serial costs about a minute and tests what the release does.
