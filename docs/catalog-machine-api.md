# The catalog machine API

The wire-level reference for whoever writes the system on the other end of the
catalog feed — an ERP adapter, a converter, a scheduled exporter.

It is the companion to [the customer machine API](customer-machine-api.md), and
the counterpart of [the automated catalog feed](catalog-sync.md), which explains
what the platform does with a run and why. This file says what to send, what
comes back, and what each of those causes.

Requirements: FR-ADM-02 (the import contract), FR-ADM-07 (the headless feed),
FR-ADM-06 (what an imported product still needs), FR-ADM-10 (an external system
owning the area), FR-NOTIF-09 (what the shop is told), NFR-SEC-09 (the
credential), NFR-OPS-07 (recording a feed that broke).

---

## 1. Credentials and prerequisites

Identical to the customer side — [§1 there](customer-machine-api.md#1-credentials-and-prerequisites)
is the full account. In short:

- `Authorization: Bearer <prefix>.<secret>`, from a token an admin issued in
  the panel. Shown once, never expires, revoked immediately on request.
- Scope **`catalog-sync`**. A `customer-sync` token cannot reach these routes
  and vice versa; a token may carry both if the operator ticked both boxes.
- Writes are refused with **409 `catalog-not-externally-owned`** until an admin
  has handed the catalog area over. While it _is_ handed over, the mirror holds:
  the admin panel refuses edits to the owned product fields with
  `catalog-externally-owned`, and the manual CSV upload is closed.
- Base URL `/api`; 60 requests per minute per IP; refusals carry a top-level
  `code` — match on it, never on `message`.
- `GET /api/machine/token` → `{ name, scopes }` to check the credential at boot.
- **There is no machine route that reads a run back**, and no outbound read of
  the catalog at all. The submit response is the whole of what a client learns.

| Code                           | Status | Meaning                           |
| ------------------------------ | ------ | --------------------------------- |
| `not-authenticated`            | 401    | missing, unknown or revoked token |
| `insufficient-scope`           | 403    | valid token, wrong capability     |
| `catalog-not-externally-owned` | 409    | nobody handed the catalog over    |

---

## 2. Submitting a catalog — `POST /api/machine/sync/runs`

Scope: `catalog-sync`. → **201** with `{ run, plan }`.

Body limit 10 MB, row cap 50 000.

### 2.1 Request body

```jsonc
{
  "rows": [/* see §2.2 */],
  "options": {
    "fields": ["name", "category", "stock"], // non-price fields this run writes
    "createMissing": true,
    "updateExisting": true,
    "restoreReturning": true, // a hidden product back in the file returns
    "createCategories": true, // unknown category ⇒ create it, unparented
    "productSetAuthoritative": false, // "this file is the complete catalog"
    "softDeleteMissingProducts": false,
  },
  "label": "nightly catalog 2026-09-17",
  "requestReview": false,
  "notice": "3 rows skipped upstream: no price",
}
```

`options` is optional and defaults as shown. **Prices are not in `fields`** —
a run writes exactly the price-list keys its rows carry, so a price-only run is
an ordinary run and needs `fields: []`, not a special mode.

`softDeleteMissingProducts` requires `productSetAuthoritative`; the pair is
refused at the schema if you set one without the other. Authority over the
product set — not the size of the field set — is what deletion needs.

`notice` is shown to staff beside the run and decides nothing on its own;
`requestReview: true` is the only way to ask to be held back.

### 2.2 The row

Keyed by `sourceId`, the source system's own private key. There is no public
article number anywhere in this platform — the storefront quotes none.

| Field              | Type                   | Notes                                              |
| ------------------ | ---------------------- | -------------------------------------------------- |
| `sourceId`         | string, req.           | the only identity the platform models              |
| `name`             | string                 | the product name                                   |
| `categorySourceId` | string                 | the category's own private key — see §2.5          |
| `categoryName`     | string                 | the **leaf** name; no parent path is carried       |
| `prices`           | `{ "<listKey>": int }` | **minor units**; only the keys present are written |
| `stockPieces`      | int                    | pieces on hand; may be negative (a stocktake)      |

**Absent ≠ empty.** An omitted field is left untouched, never cleared. A run
cannot stop tracking a product's stock by omitting the cell — only an admin
clearing the field does that.

**The category pair travels together.** Both or neither: an id without a name
cannot create the category, a name without an id cannot say which one it
renames. New categories are created **unparented**, as roots, for an admin to
place in the tree — the export carries no hierarchy, and the tree's shape
(parent, order, nickname, image, description) has always been the shop's.
A rename keeps the slug, so URLs survive.

**Prices are integers in minor units.** The API knows no currency, no locale
and no minor-unit exponent; major→minor conversion is the converter's job,
because the converter is the half that knows the deployment's currency. A key
is either `default`-badged list's own key or any `customer_tiers.key`; in CSV a
bare `price` column is an alias for whichever list carries the default badge.
Zero is refused per row (`price-is-zero`) — no price, not a free product.

The body is `strict`: an unknown field fails the whole request.

### 2.3 Row errors

One bad row never fails a run. It is skipped, listed in `plan.rowErrors`, and
counted in `summary.errors`.

| Code                       | `params`                 | Meaning                                    |
| -------------------------- | ------------------------ | ------------------------------------------ |
| `missing-source-id`        | —                        | no key                                     |
| `duplicate-source-id`      | —                        | the same key twice in one run              |
| `category-id-without-name` | `category`               | half the category pair                     |
| `category-name-without-id` | `category`               | the other half                             |
| `unknown-category`         | `name`, `key`            | and `createCategories` is off              |
| `category-name-conflict`   | `key`, `first`, `second` | the file names one category twice          |
| `price-not-an-integer`     | `price`, `column`        | —                                          |
| `price-is-zero`            | `column`                 | no price, rather than a free product       |
| `stock-not-an-integer`     | `stock`                  | —                                          |
| `unknown-price-list`       | `key`, `known`           | no tier is keyed that (`known` lists them) |
| `cannot-create-product`    | —                        | unknown key with `createMissing` off       |

As on the customer side, a malformed _field_ in a headless submission refuses
the whole request (400) rather than one row — a converter should be fixed, not
tolerated. Per-row forgiveness of bad cells is for an operator's CSV upload.

### 2.4 What comes back

```jsonc
{
  "run": { "id": "…", "area": "catalog", "source": "api",
           "status": "applied", "stagedReason": null,
           "tokenName": "erp nightly", "summary": { … } },
  "plan": {
    "summary": {
      "rows": 812, "create": 4, "update": 61, "softDelete": 0, "restore": 1,
      "unchanged": 746, "errors": 0,
      "categoriesCreated": 1, "categoriesRenamed": 0, "categoriesEmptied": 0,
      "keptManual": 3,
      "fields": ["name", "price:wholesale", "stock"]
    },
    "products": [ { "kind": "update", "sourceId": "A-91", "name": "…",
                    "slug": "…", "changes": [
                      { "field": "price:default", "from": 1990, "to": 2090 } ] } ],
    "categories": [ { "kind": "create", "name": "…", "from": null,
                      "productCount": 12 } ],
    "emptiedCategories": [ { "slug": "…", "name": "…" } ],
    "keptManual": [ { "sourceId": "manual:…", "name": "…" } ],
    "rowErrors": [],
    "truncated": false      // lists capped at 2000 items; counts stay exact
  }
}
```

`summary.fields` says what the run actually rewrote — for a feed on a
twenty-minute cadence, more useful than the counts. Only rewrites are listed;
a created product writes everything it carries by definition.

### 2.5 What the shop made itself

The two sides of the catalog are keyed differently, and the asymmetry is
deliberate.

**A product always has a key.** One created in the admin panel is minted a
`sourceId` of `manual:<uuid>` — every product is quoted, ordered and invoiced by
a key, so it needs one whether or not an exchange knows it. Such keys are absent
from every real export by construction, so a delete sweep skips them and reports
them in `keptManual`: an informed exclusion rather than a silent one. Never send
a `manual:` key yourself.

**A category may have no key at all.** A category is a container the shop
invented, not a row your system is missing, so one created in the panel without
a key simply has `null`. Until v1.11.0 it was minted a `manual:<uuid>` like a
product, purely so the column could be `NOT NULL`; that bound it to nothing and
made a shop-invented category look like the exchange's to write, so the keys
were dropped and the existing ones cleared by migration. **There is no
`manual:` category in any deployment from v1.11.0 on**, and a `manual:` prefix
you may have seen in an older export of your own mapping refers to nothing.

That has one consequence an adapter has to plan for: **a keyless category is
invisible to a run.** Matching is by `categorySourceId` alone, with no fallback
to the name, so sending a key nothing holds creates a _new_ category (or fails
the row with `unknown-category` when `createCategories` is off) even when a
category of exactly that name is already there. A shop that built its tree by
hand before the feed arrived ends up with the tree twice.

The fix is on the platform's side and is one field: an admin binds a hand-made
category to the source key by typing it in (omitted keeps what is stored, a
string binds, `null` detaches it again). Worth saying to whoever runs the
go-live, because it is **not** closed by the ownership switch: a keyless
category is nobody else's, so its name and its key stay open even while an
external system owns the catalog. Only a category that already carries a key is
frozen — from then on its name and its key are the exchange's, and a rename in
the file is a rename in place rather than a second category.

Keyless categories do still appear in `emptiedCategories` when a run empties
them. They are reported, never written.

A run also never:

- **deletes a category.** It creates and renames; emptied categories are
  _reported_ (`emptiedCategories`) and removing one is an admin's act.
- **publishes anything.** An imported product arrives unpublished and waits for
  an admin (FR-ADM-06) — and a product the file carries no price for could not
  be published anyway. This is what the fourth notification mail is about (§4).
- **writes anything outside `fields` and the price keys the rows carry.** A
  price-only run can never clobber an admin's rename.

### 2.6 Run status, and when a run waits for a person

The statuses are the shared ones: `applied`, `no-change`, `previewed` (staged,
**nothing written**), `failed`, `superseded`, `discarded`. See
[the customer table](customer-machine-api.md#36-run-status--did-it-actually-happen)
— it reads identically here, including the rule that **there is no machine
commit route** and that retrying a staged run merely supersedes it, so nobody
ever answers it.

A catalog run stages itself when, in this precedence:

1. `requestReview: true` → `stagedReason: "requested"`
2. `summary.create > maxCreates` (default **100**)
3. `summary.softDelete > maxSoftDeletes` (default **0**)
4. `summary.categoriesCreated > maxCategoriesCreated` (default **5**)
5. `summary.categoriesEmptied > maxCategoriesEmptied` (default **0**)
6. changed share > `maxChangedShare` (default **0.5**) — where changed is
   create + update + softDelete + restore over the live catalog _before_ the run

→ `stagedReason: "policy"`. A first import into an empty catalog scores no
share at all (there is nothing there to endanger); the creates ceiling judges it.

The share ceiling is the one with no customer counterpart: it catches an export
that was filtered wrongly and now rewrites everything, which no absolute number
notices in a catalog of a few hundred.

**Practical consequence:** on default settings any sweep that hides a product
waits for a person, and so does any regrouping that empties a category. If your
feed runs a nightly authoritative export, expect staged runs whenever the source
drops an article, and plan for an operator who reads the queue.

### 2.7 Reporting your own breakage — `POST /api/machine/sync/failures`

```json
{ "message": "source export unreadable: …", "label": "nightly catalog" }
```

→ 201 `{ run }` with `status: "failed"`. Kept verbatim, ≤ 500 chars. Call it
whenever a scheduled run cannot happen: a feed that has stopped sending is
otherwise indistinguishable from one with nothing to send, and this is what
drives the "the feed has stopped" mail.

---

## 3. CSV, and the manual fallback

The same rows in another encoding, for an operator uploading a file in the
panel (never for a machine client). Header row required, order-independent;
columns `sourceId`, `name`, `categorySourceId`, `categoryName`, `price:<key>`
(bare `price` = the default-badged list), `stock`. An empty cell means "not in
this file", never "clear this field".

The upload is closed exactly while an external system owns the catalog, and the
headless route is closed exactly while nothing does — one pen, one holder.

---

## 4. When mail is sent

Only to the shop; a catalog run mails no customer. The addresses are the
deployment's configured admin ones, and the mails are **state changes of your
feed**, not per-run announcements — a feed that breaks at midnight writes one
mail, not seventy-two. State is read off the previous _machine_ run of the
catalog area alone, so the customer feed's health is never mixed in.

| Transition                        | Mail                                             |
| --------------------------------- | ------------------------------------------------ |
| ok/waiting → failed               | the feed has stopped                             |
| failed → anything else            | working again (plus a waiting mail if it staged) |
| ok → waiting                      | a run is waiting for a decision                  |
| applied, unattended, `create > 0` | **new products nobody has published yet**        |

The last one is the catalog's own, and is not a transition: every such run is
its own piece of news, linking to `/admin/products?state=unpublished`. It is
not sent for a staged run an admin applied by hand — they have just read the
preview that says it. The customer exchange has no counterpart to it.

Nothing here is retried and nothing fails a run: the catalog is written and the
panel says so whether or not SMTP was reachable.

---

## 5. Adapter checklist

- [ ] `GET /api/machine/token` at boot; assert `catalog-sync`.
- [ ] Convert major→minor units on your side; never send a zero price.
- [ ] Send both halves of the category pair, or neither; leaf name only.
- [ ] Before the go-live, have an admin bind each hand-made category to its
      source key — a keyless one is invisible to a run and will be duplicated.
- [ ] Send only the price-list keys this run means to write.
- [ ] Set `productSetAuthoritative` only for a genuinely complete export, and
      `softDeleteMissingProducts` only on top of it.
- [ ] Never send a `manual:` key.
- [ ] Set `requestReview` whenever your parse was not fully trustworthy; put the
      why in `notice`.
- [ ] Treat `status: "previewed"` as "a person must act", log it, do not retry.
- [ ] Report every failed cycle to `/failures`.
- [ ] Match on `code`, never on `message`.
