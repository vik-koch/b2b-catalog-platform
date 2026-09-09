# 0052 — Generate an order's documents, and let a supplied file replace them

**Status:** accepted · **Date:** 2026-09-09

## Context

Two documents hang off an order. A bank transfer needs payment instructions the
customer can act on, which the manager attaches (FR-CART-05). A finished order
needs a readable summary the customer can keep (FR-ACC-02). The shop already
produces paperwork of its own, in its own layout, from the system it keeps its
books in — and where that paperwork exists, it is the document the customer
should be looking at, not a lookalike this platform drew. Requirements:
FR-ORD-05, FR-CART-05, FR-ACC-02.

Alternatives considered: generating everything and never accepting a file;
accepting files only and generating nothing; rendering PDFs by driving a
headless browser over the existing HTML views; letting the future exchange
adapter draw the PDF from the data it already carries.

## Decision

- **An order carries one document per kind** — `payment-instructions` and
  `order-summary` — and a kind is either _supplied_ (a file somebody or some
  system put there) or _generated_ by the platform. A supplied document
  **replaces** the generated one entirely; removing it falls back to the
  generated one. No screen ever offers two documents of one kind and leaves the
  reader to guess which is real.
- **The summary is generated on demand from a revision** — the one the reader
  is entitled to: the current one for staff, and for the customer the version
  their own page shows (ADR 0051). It is available at every state, not only on
  a finished order. A document is a copy of the order they can keep, and one
  that quoted a version nobody had explained to them would say what no screen
  and no message ever did.
- **Payment instructions are only ever supplied**, because only the shop knows
  what they say, and the control for them appears only where the order is
  invoiced. On a cash order the document cannot exist, and a permanently
  disabled control states nothing.
- **A customer is shown a payment slip while the money is owed**, and not
  otherwise: it appears when the order becomes due and goes when nothing is —
  before the shop has answered, and after an unpaid order ends. Paid keeps it,
  because a settled invoice is a receipt somebody keeps. That is the payment
  state's own answer (FR-ORD-04) rather than a second rule about methods; a
  cash order never becomes due, so it never shows one.
- **Order documents are private.** Product documents are served by nginx off a
  public prefix, which is right for a certificate and wrong for a file naming a
  customer, their address and their prices. An order's bytes are written to a
  subdirectory nothing serves, and read back through the API under the order's
  own access rule: the account that placed it, staff, or the order's token
  (FR-NOTIF-06) — the same three ways the order itself is readable.
- **Bytes are stored unmodified**, through the same port as product documents
  (ADR 0048). Nothing re-encodes a file somebody will print.
- **Generated with a PDF library, not a browser.** The layout is plain and
  written once, and is set in one of the reader's own standard faces unless the
  deployment names a TrueType/OpenType file of its own.
- **Telling the customer about a document is its own act**, repeatable, and
  the order remembers it. A file arriving is not a change to the order: it
  writes no revision (ADR 0051) and moves no pointer, so it cannot ride on the
  notification tick that a move carries. Uploading and writing are two buttons,
  because a manager files a document when they have it and writes when the
  order is ready to be written about; `notifiedAt` on the document is what
  lets the second button say whether it is still owed. The payment
  instructions travel with that message as an attachment, and with any status
  message sent while the money is owed — an accepted invoiced order and the
  details for paying it are one piece of news.
- **A supplied document is not shown before the version it belongs to is.** A
  file filed against a version the customer's own page has not reached would be
  the first they hear of it. There is deliberately **no visibility flag of its
  own**: a second gate would be a second way to fail silently, with a manager
  filing a slip and the customer waiting for details that already exist.
- **A supplied document is deleted when the account is** — bytes and row —
  where anonymization can only scrub the columns it can read. The generated
  summary needs no such rule: it renders from a scrubbed revision.
- **It is not an invoice.** The generated document states what was ordered, for
  whom, at what prices and where it is going. Invoicing, tax and the numbering
  those need stay with the system that already does them.

## Rationale

**The real document beats a faithful copy of it.** Re-drawing a shop's invoice
would mean tracking its layout, its numbering and its jurisdiction's rules in
this codebase forever, and being wrong about all three at some point. Accepting
the file the shop already produces costs one table and is right permanently.

**Generating is still the default**, because a deployment with no such system —
the demo, and this platform's whole manual mode — must produce something, and
because a customer asking for their order in writing should not have to wait
for a person.

**Private because the file is about a person.** The order screens are already
gated three ways and the document is the same information in one file, so it
gets the same gate. A capability URL on a public prefix would be the one place
in the platform where personal data is readable without a session, a token or a
role — and, being content-addressed and cached immutably, the one place it
would stay readable after the order stopped being anybody's business.

**A headless browser is the wrong dependency for this host.** It is the largest
thing that would run on the box, for one page of tabular text, on an
architecture where it is the least well behaved. A library draws the same page
deterministically and starts instantly.

**The drawing library is a leaf, chosen for the host and not for its
liveliness.** `pdf-lib` is pure JavaScript, six packages including its
fontkit, so the multi-arch image gains nothing to compile and nothing to
install per architecture, and it embeds a subsetted `ttf`/`otf` face. It has
not had a release in years, which is worth stating plainly: the usual risk in
a PDF library lives in its parser, and this one is never asked to read a PDF — a
document is written from an `OrderDetail` and a supplied file is stored and
served as opaque bytes. The exposure is therefore a missing feature rather than
a vulnerability, and the whole use sits behind one injectable, so replacing it
with a maintained drawing library is a rewrite of the drawing calls and of
nothing that calls them.

**Storing unmodified is the same argument as a certificate.** A re-encoded
payment slip is not the payment slip, and the image pipeline exists to
re-encode.

**A document is not a version.** Filing a file changes nothing about what the
order says, and writing a revision for it would put an entry in the thread that
diffs to nothing and a number on a page the customer would be told had changed.
But it is still worth an email — a manager who accepted an order and then
remembered the slip has no other move, since an adjustment that changes nothing
is refused (`no-change`). So the mail is uncoupled from the tick, for this one
case, deliberately.

**The typeface is named separately from the web's, and nothing is shipped.** A
deployment already ships its own face as `woff2` for the web, and that file
cannot be reused: PDF embeds TrueType/CFF, and a `woff2` put through fontkit is
tagged as TrueType and then rejected by Acrobat while rendering fine everywhere
else — a failure that appears only on the reader's machine. So the PDF face is
named as `ttf`/`otf` files beside the web ones. A deployment that names none
prints in a standard face, which needs no file, no licence and no megabyte in
the image, and which covers the Latin alphabets with their accents. It cannot
write anything outside them: those characters are drawn as question marks
rather than failing the document, and a deployment writing in another script
supplies its own face.

## Consequences

- (+) A deployment that later wires its back-office in supplies documents
  through the same endpoint, with no change to how they are read or mailed, and
  no new format: the exchange sends bytes, not markup. The adapter's rule is
  **supply the document before the version that announces it**, so the message
  a customer gets about an accepted order carries the slip that goes with it.
- (+) The generated summary is derived from a revision (ADR 0051), so
  regenerating it is safe — the same document comes back however long
  afterwards, and a customer's copy cannot run ahead of what they were told.
- (+) Nothing is stored for a generated document: no bytes, no row, no
  invalidation when a revision is written.
- (−) Reading an order's document costs the API process a request nginx would
  otherwise have answered, and generating one costs it a render. Both are rare
  and small; the alternative was making them public.
- (−) A supplied document is opaque: the platform cannot check that it belongs
  to the order or says what the order says, and a later change can leave it
  quoting a total the order no longer has. It is filed as given, marked with
  the version it was supplied against, and flagged to staff — but only where
  what it _states_ has moved. A payment slip is stale when the money, the party
  invoiced, the invoice address or the payment method changed, and not because
  the order was confirmed and then made ready; a warning nobody would act on is
  one that teaches staff to ignore the next.
- (−) The generated layout is plain and will not match a shop's stationery.
  That is the case for supplying the real one.
- (−) The drawing library is unmaintained. Acceptable while it only writes, and
  while the escape is one file wide; a feature it never grew — wrapping tables,
  PDF/A — is the thing that forces the swap, not a CVE.
- (−) Where the shop's system cannot produce the slip until after it has
  accepted the order, the customer gets two messages rather than one. Honest,
  and what a shop does by hand anyway; the alternative was holding an
  acceptance mail for a file that may never arrive.
