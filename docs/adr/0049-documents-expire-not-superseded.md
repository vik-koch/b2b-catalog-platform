# 0049 — Documents expire; they are not superseded

**Status:** accepted · **Date:** 2026-09-05

## Context

A certificate has a validity date. When it passes, the storefront must stop
showing it and the admin must be told, and in the usual case the shop already
has the re-issued version of the same document. A product may carry several
documents at once, so "the current one" is not a single row per product.
Requirements: FR-DOC-01…04, FR-WORK-02.

Alternatives considered: a `supersededBy` pointer between document rows; a
version chain per document with the newest shown; deleting an expired row
automatically.

## Decision

- **A document's file and dates are editable in place.** Uploading a new file
  and a new expiry onto the existing row is how a re-issued document replaces
  its predecessor; the row keeps its title, its identity and every product link.
- **There is no supersession relation and no version history.** The row's
  `fileUrl` is rewritten; the bytes it replaced are left to the media prune
  sweep, which deletes exactly the files no row points at any more.
- **Expiry only hides.** `expiresAt is null or expiresAt > now` filters the
  storefront query; the row stays, listed for the admin as expired until it is
  replaced or deleted. Nothing is deleted automatically.
- **Three admin states:** valid, expiring within 30 days, expired — a status
  column in the document list, filterable like any other admin grid's state.
  Thirty days is fixed, not configured. Expiring and expired are counted
  together as one figure of work: they are one job, and a document crosses from
  the first to the second with nobody touching it.

## Rationale

**The links are the expensive part.** A document is attached to dozens of
products by hand; a supersession chain would make the replacement a new row that
has to inherit those links, and inheritance is where such a feature quietly goes
wrong. Editing the row leaves the links untouched because they were never about
the file.

**A chain would create a question the model cannot answer.** With several live
documents per product, "show the newest" is not a rule — the newest data sheet
does not supersede last month's certificate. Only the admin knows which document
replaces which, and the way they say so is by opening that document and
replacing its file.

**Expiry that hides but does not delete keeps the work visible.** An
auto-deleted row would clear the warning without the certificate being renewed,
which is the one outcome the warning exists to prevent.

**A fixed 30 days.** It is a reminder, not a policy; a configurable number would
be a key in every deployment config for a value nobody will tune.

## Consequences

- (+) The expired count is a query over `expiresAt`, so it plugs into the
  work-awaiting counts (ADR 0046) with no state of its own.
- (+) A document with no expiry is simply always valid — data sheets need no
  special case.
- (−) There is no record of what a product's certificate said last year. If a
  deployment ever needs that, it is an archive flag on the row, not a chain.
- (−) An admin who uploads the renewal as a _new_ document instead of replacing
  the old one gets two rows, one of them expired and warning forever. The
  document form leads with "replace file" for that reason, and deleting is one
  click from the warning.
