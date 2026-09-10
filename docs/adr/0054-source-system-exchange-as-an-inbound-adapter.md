# 0054 — Put the source-system exchange behind an inbound adapter

**Status:** accepted · **Date:** 2026-09-10

## Context

FR-ADM-07 asks for an automated catalog feed from the deployment's source
system. ADR 0022 already put a converter in front of the backend so the raw
export's shape stays the converter's problem, and ADR 0026 fixed what that
converter produces: a row contract, a per-run intent and a staged run. What is
undecided is where the converter runs, what it is allowed to know, and how much
of the source system's world the platform has to model.

Two constraints shape the answer:

- The exchange format is **regional and system-specific**, as the address and
  party providers were (ADR 0040, ADR 0041). Naming it in this repository would
  put a deployment's back-office in the public portfolio and make a change of
  source system a change to shared code.
- The source system is the **initiator**. It calls in on a schedule; nothing
  here calls it. This inverts the suggestion sidecar, which the platform calls
  and which fails to an empty answer nobody sees.

Alternatives considered: implementing the format inside the API; a thin
protocol terminator here with the conversion done in the API; letting the
adapter write to the database directly.

## Decision

- **A private adapter container, called by the source system, calling the
  platform.** It terminates whatever protocol that system speaks, converts to
  the ADR 0026 row contract, and submits it over the machine endpoint
  (ADR 0053). The platform holds no format knowledge and gains no dependency.
- **The adapter is stateful and its failures are loud.** It owns a volume — a
  session in this direction is multi-request and resumable — and anything that
  fails before a run exists is still reported to the platform and recorded as a
  failed run (FR-ADM-09), rather than being retried into silence.
- **The platform models one identity per entity.** `products.sourceId` and
  `categories.sourceId` are, as they always were, the source system's key and
  nothing more. Whatever else that system knows about a record — further
  identifiers, their correspondence, how a key comes to change — is the
  adapter's concern, and the platform neither stores it nor has an opinion
  about it.
- **The ownership split is fixed, not provisional.** The source system owns
  identity, name, category, price and stock. The platform owns everything a
  customer reads: descriptions, images, attributes, documents and pairings. An
  import never carries them and the field whitelist of ADR 0026 is what
  enforces it.
- **There is no direction in which the platform writes catalog content back.**

## Rationale

**The adapter boundary is the same one ADR 0040 and 0041 drew, for the same
reason.** A format is a property of one deployment's back office; a row contract
is a property of the platform. Keeping the first outside means the client's
system can be replaced, upgraded or reconfigured without a release here, and it
means the public repository demonstrates the seam rather than one region's
plumbing.

**Being called rather than calling is what makes this container different from
the suggestion one**, and the difference has to be designed for rather than
discovered. A suggestion that fails costs a convenience and correctly disappears;
an import that fails costs the shop its prices. Hence the volume, the resumable
session, and the rule that a failure which never became a run is still a run in
the log.

**One identity, because a second one propagates.** A source system may well
distinguish a record's internal identifier from the key it prints on a
document, and modelling both here looked tempting: it survives a key that
changes. But a second identity does not stay in one table — products,
categories, and the identity an order line snapshots so its history stays
readable all want it, and each copy is another thing that can disagree. It also
makes keys mutable, which the order snapshots are written on the assumption
they are not. Keeping the correspondence in the adapter costs it state it must
hold a volume for anyway, and costs the platform nothing. ADR 0026's contract
gains only a way for a run to _say_ a key changed (`previousSourceId`), which
is a statement about one row rather than a second identity.

**Stating the ownership split as permanent** costs nothing and settles a
recurring question. It is also what the platform is _for_ in a deployment that
already has a back office: the catalog layer that system does not hold.

## Consequences

- (+) Nothing in this repository names a format, a protocol, or a source
  system. A second deployment with a different back office writes a different
  adapter against the same machine endpoint.
- (+) No schema change, and no re-keying of anything that already references a
  product. The manual upload keys on exactly what it always did, which is what
  keeps it a working fallback rather than a path that quietly stopped matching.
- (−) The adapter holds state, so it needs a volume, a restart story and its own
  observability. It cannot be treated as the stateless proxy the suggestion
  sidecar is.
- (−) The platform cannot answer "which record in that system is this" on its
  own — only "what key did it come in under". That is deliberate; the adapter's
  own log is where the fuller question is asked.
- (⚠) The protocol, its version handling, the field-by-field mapping and
  whatever identity bookkeeping that particular source system requires are all
  specified in the private deployment repository, not here.
