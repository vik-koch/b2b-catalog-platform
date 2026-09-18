# The three exchanges, side by side

The platform exchanges three areas of its data with an external system: the
**catalog**, the **customer accounts**, and **order processing**. They share a
run table, an ownership switch, a credential and a set of screens (ADR 0060),
which makes them look more alike than they are — and the places where they
differ are exactly the places an integrator gets wrong by assuming the area
they wrote first.

This document is the map. Each area's own documents are the territory:

|                   | Catalog                                          | Customers                                          | Orders                                       |
| ----------------- | ------------------------------------------------ | -------------------------------------------------- | -------------------------------------------- |
| What it does, why | [catalog-sync.md](catalog-sync.md)               | [customer-sync.md](customer-sync.md)               | [order-sync.md](order-sync.md)               |
| What to send      | [catalog-machine-api.md](catalog-machine-api.md) | [customer-machine-api.md](customer-machine-api.md) | [order-machine-api.md](order-machine-api.md) |
| Requirements      | FR-ADM-02, FR-ADM-07                             | FR-ADM-11…15, FR-ADM-17, FR-ADM-18                 | FR-ADM-08                                    |

---

## The whole comparison

|                                                    | **Catalog**                                                                                                     | **Customers**                                                               | **Orders**                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Which way does data flow?**                      | inward only                                                                                                     | both ways                                                                   | both ways                                                                                    |
| **Is there an outward read?**                      | **no** — nothing reads the catalog out                                                                          | `GET /machine/customers/accounts`                                           | `GET /machine/orders`, `GET /machine/orders/{reference}`                                     |
| **Inbound route**                                  | `POST /machine/sync/runs`                                                                                       | `POST /machine/sync/customers/runs`                                         | `POST /machine/sync/orders/runs`                                                             |
| **Scopes**                                         | `catalog-sync`                                                                                                  | `customer-sync` (write), `customer-read` (read)                             | `order-sync` (write), `order-read` (read)                                                    |
| **Writes gated on ownership?**                     | yes                                                                                                             | yes                                                                         | yes                                                                                          |
| **Read gated on ownership?**                       | n/a                                                                                                             | **no**                                                                      | **no**                                                                                       |
| **Can a run be staged for a person?**              | yes                                                                                                             | yes                                                                         | **never**                                                                                    |
| **Auto-apply policy**                              | `maxCreates` 100, `maxSoftDeletes` 0, `maxChangedShare` 0.5, `maxCategoriesCreated` 5, `maxCategoriesEmptied` 0 | `maxInvites` 25, `maxDisables` 0, `maxClaims` 0, `maxIdClaims` 0            | **none** — there is nothing to hold back                                                     |
| **Who reviews a staged run?**                      | admins                                                                                                          | admins and managers                                                         | n/a                                                                                          |
| **Counted as work awaiting?**                      | `stagedCatalogRuns` (admins)                                                                                    | `stagedCustomerRuns` (admins, managers)                                     | not counted — nothing waits                                                                  |
| **Manual fallback for an operator**                | file upload (FR-ADM-02)                                                                                         | file upload (FR-ADM-12)                                                     | **none** — the panel's own buttons are the fallback, and the switch is how you get them back |
| **Does a run create records?**                     | yes, products and categories                                                                                    | yes, accounts (invited)                                                     | **never** — an order arrives from the storefront                                             |
| **Does a run remove records?**                     | soft-delete (hides)                                                                                             | **never** — the strongest row disables                                      | **never**                                                                                    |
| **What identifies a record**                       | `sourceId`, the source system's own key                                                                         | `sourceId`, or a claim by email or by the platform's account id (FR-ADM-17) | `reference`, which **this** platform issued                                                  |
| **Concurrency**                                    | last run wins; a staged run is superseded by a fresher one                                                      | same                                                                        | `basedOnRevision` per instruction — a stale one is refused                                   |
| **What one submission carries**                    | the whole catalog                                                                                               | a set of account rows                                                       | a set of per-order instructions                                                              |
| **Body limit / cap**                               | 10 MB, 50 000 rows                                                                                              | 10 MB, 50 000 rows                                                          | 10 MB, **2 000** instructions — the cap is what a run can answer for, one result per order   |
| **Per-row refusals**                               | yes, never fail the run                                                                                         | yes                                                                         | yes                                                                                          |
| **Run read-back**                                  | `GET /machine/sync/runs/{id}`                                                                                   | `…/customers/runs/{id}`                                                     | `…/orders/runs/{id}`                                                                         |
| **Failure report**                                 | `POST /machine/sync/failures`                                                                                   | `…/customers/failures`                                                      | `…/orders/failures`                                                                          |
| **Mail to the shop**                               | 4: failed, recovered, waiting, new products                                                                     | 3: failed, recovered, waiting                                               | **2**: failed, recovered                                                                     |
| **Mail to a person**                               | none                                                                                                            | the set-a-password link it can never supply itself                          | the order's own thread — receipt, status, documents                                          |
| **Does the sender choose whether a person hears?** | no                                                                                                              | no                                                                          | **yes** — `notify` and `showCustomer`, required per instruction                              |
| **Files as bytes**                                 | product documents are the shop's own upload                                                                     | none                                                                        | **yes** — `POST /machine/orders/{reference}/documents/{kind}`                                |

---

## Where the areas really differ

### 1. Only two of them read outward

The catalog goes one way. Nothing reads products back out, because the
receiving system is the one that sent them — a read would be handing somebody
their own export. Customers and orders both read outward, and for the same
reason: the shop **acquires** them on its own. Somebody registers; somebody
places an order. An external system has to be able to see what arrived here
that it has never heard of.

Both outward reads are ungated by ownership, and that is not an oversight. The
case each exists for is the one _before_ the hand-over: a system being prepared
for a go-live pulls accounts and orders for weeks before anybody lets it write
one. What gates them is the token an admin issued, which is what NFR-LEGAL-07
means by a transfer being configured rather than assumed.

### 2. Ownership covers a whole area — except the catalog's

Handing over customers or order processing closes the admin panel's side of
them **completely**: the screens stay readable, every action is refused. The
catalog is the exception, and deliberately so. What the shop **presents** stays
the shop's however the catalog is owned:

- a product's publication, its description and its pictures;
- how categories are named for display, pictured and arranged;
- a category the external system never named — one the shop invented, carrying
  no source key — entirely, its name included, because nothing outside writes
  it. Giving it a key is how it joins the exchange;
- a price list's name, and whether it exists at all. Only the **key** the
  external system addresses it by is frozen.

The line is the same one everywhere: what the source system knows is read-only,
what the shop makes up is not. It is only the catalog that has both kinds of
field in one record.

### 3. Orders are the only area where the customer keeps writing

Customers and catalog are closed to the shop's staff while owned, and that is
the whole of it. Orders have a third writer who is never closed out: the
customer.

- **Placing an order** stays open however the area is owned, so an owned area
  keeps acquiring work.
- **Calling one off** — while nobody has answered it — stays open too
  (FR-ORD-02), because the switch is about who does the shop's work, not about
  whether a person may use the shop.

For an adapter, both are facts to read rather than conflicts to resolve. An
instruction arriving for an order **the customer** cancelled is refused with
`order-called-off` rather than driving it forward; the alternative is a
cancellation that silently never happened. A cancellation the shop or the
owning system made is not protected that way — the read says which it was
(`cancelledBy`), and the owning system may reopen its own, which it has to be
able to do because while it owns the area nobody in the panel can.

### 4. Only orders refuse staging

A catalog or customer run whose effect is bigger than the deployment allows
unattended is **held for a person**, because a person here is the fallback
owner of that data. There is no such fallback for an order that has been handed
to another system: staging an answer would leave the customer waiting on a
decision nobody in this shop is placed to take, and a source polling every few
minutes would file a run per cycle for somebody to read.

So the order area has no policy, no ceilings, no `requestReview`, no commit
route, no staged count and no "a run is waiting for you" mail. Its admin screen
is a log with no buttons on it, and its runs are terminal on arrival.

### 5. Only orders let the sender decide what the customer hears

A catalog run writes products; nobody is written to. A customer run's mail is
decided by what the run did — an invited account gets its link because it needs
one. An order write-back is the only place where the sending system answers the
two questions a manager answers on every move (FR-NOTIF-03): whether a message
goes out, and whether the customer's own page follows the new version. Neither
has a default on the wire, because a default would quietly decide for the shop
how loud its own mail is.

### 6. Identity runs in opposite directions

The catalog and the customer book are keyed by the **source system's** own key.
An account that has none is invisible to every row, which is the deadlock
FR-ADM-17 exists to break — once, by a claim a person usually has to agree to.

An order is keyed by a **reference this platform issued**. There is nothing to
claim and nothing to match: the exchange reads the reference out and writes it
back. What an order needs instead is a _counterparty_, which is why the outward
read names the account by `sourceId` where it has one and by the platform's own
`accountId` where it does not — an order can perfectly well arrive for a
customer the other system has never heard of.

---

## What is the same everywhere

Worth stating, because it is what makes the differences legible:

- **One credential mechanism.** A machine token, issued once by an admin, shown
  once, never expiring, revoked to turn it off (ADR 0053, NFR-SEC-09). Scopes
  are chosen at issue time and are not editable afterwards.
- **One run log.** Every area files `sync_runs` rows with the same lifecycle,
  the same counters and the same screens, read by whoever may do that area's
  work by hand (FR-ADM-09). Every area can read one of its own runs back, and
  every area can report its own breakage.
- **One ownership switch**, area by area, with a shop-wide reading over the
  three that is derived rather than stored. Only an admin may change it, it
  takes effect without a deploy, and every change is recorded with who made it.
- **Refusals are codes, never messages.** Match on `code`; the message is not a
  contract and is not localized for the sender.
- **An instruction that repeats itself changes nothing and notifies nobody**
  (FR-ADM-16), in every area, because every automated source re-sends.
- **Nothing outside ever issues a credential**, and nothing outside ever
  deletes a person or their orders (FR-ADM-13, FR-ADM-15, ADR 0061).
