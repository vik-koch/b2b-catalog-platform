# Per-deployment config

This directory is bind-mounted read-only into **both** the `web` and `api`
containers at `/config` (see `compose.yml`). It is the single per-deployment
config surface: branding, text and wording are retuned here without
rebuilding the public image.

This one is the **test fixture** (the Coffee Kontor, in English): the local
smoke test and the test suites run on it. The demo stacks run the other
directories in [deployments/](../../README.md). A real deployment ships its own
copy instead (via `CONFIG_DIR`, see below) and never commits it here.

## The files

```
deployment.json      the deployment's public facts      web + api, sent to every visitor
api.json             what only the API reads            api
texts/common.json    shared names                       web (every page) + api
texts/app.json       the storefront's wording           web (every page)
texts/admin.json     the admin's wording                web (fetched by admins)
texts/mail.json      every email                        api
texts/pdf.json       the documents the API draws        api
assets/              logo, favicon, fonts               served by the web
password-blocklist.txt                                  api, optional
```

- `deployment.json` → `DeploymentConfig` (the locale, branding, contact, seller line, locations,
  map provider, cookie-consent flag, which consents are asked for, whether orders carry an
  invoice address, phone and company-id input rules, address rules, currency,
  tax basis, collection points, delivery zones, order-reference format, the
  second sign-in step). **Everything in it is visible to any visitor**: the web
  injects the whole file into every page. The API reads it too, for the halves
  an order depends on: it validates a submitted collection point, resolves the
  delivery zone itself rather than trusting the browser's, formats money for
  the mails, and mints the order reference.
- `api.json` → `ApiConfig`, what only the API reads and a visitor has no use
  for: whether the receipt attaches the terms, how long records are kept, how
  long a session lasts, and what an unattended sync run may do. A new setting
  goes here unless the browser needs it.
- `texts/common.json` → `CommonText`, the shop's **shared names** — what the
  storefront, the admin, mail and the order summary would otherwise each repeat
  (page names, units, the tax statements, the controls every screen has) — and
  what customers read in more than one place, such as a field's check or an
  order's status. Never wording only staff read. **Browser-delivered** via
  shell state and **also loaded by the API**.
- `texts/app.json` → `AppText`, the **public** UI-text catalog (storefront
  chrome, the login form, error messages).
  **Browser-delivered** via shell state.
- `texts/admin.json` → `AdminText`, the wording of the **admin** surfaces
  (editors, management screens, catalog sync, storefront edit mode).
  **Browser-delivered on demand**: fetched from `/admin-text.json` once an admin
  needs it, rather than injected into every visitor's document (ADR 0009,
  amendment 2). Non-secret, like everything else on this side of the line.
- `texts/mail.json` → `MailText`, every email the app sends, one section per
  message. **Server-only** — rendered in the API, never sent to a browser.
- `texts/pdf.json` → `PdfText`, the documents the API draws as PDFs: the order
  summary, and the file name of the terms attached to a receipt.
  **Server-only**, like the mail text.

The mails and the PDFs take the branding (shop name, header colour), the
typeface and the money formatting from `deployment.json`.

A name that reads the same to customers and staff is in `texts/common.json`
once; where staff word a thing differently (order statuses, the messages under
a field), theirs is in `texts/admin.json`, and in `texts/mail.json` where a
staff mail needs it. `texts/common.json` reaches every visitor, so nothing only
staff read goes there. Controls that read the same on every screen — Cancel,
Close, Remove, "Saving…" — are its `actions`; a control that names what it does
("Delete selection") keeps its own key, and staff-only verbs (Save, Edit,
Delete) are the admin text's `actions`. Wording for entries the deployment
itself defines — delivery zones, collection points, company-ID formats — sits
beside those entries in `deployment.json`. ADR 0018 (amendment) has the
reasons.

Both containers find the directory through one variable, `CONFIG_PATH`, which
compose sets to the `/config` mount; for `nx serve` the workspace `.env` points
it at this directory (`CONFIG_PATH=config`). Every file is named relative to
it, so there is nothing else to wire, and a deployment cannot point one file
somewhere the others are not.

A deployment may also mount a **common-password blocklist** — a plain
newline-separated file of passwords to refuse, named by `PASSWORD_BLOCKLIST_FILE`
(api). It is optional and has no default: which passwords are common depends on
the language a deployment's customers think in, so the list belongs to the
deployment rather than to this repo. Published top-N lists are the usual source.
Without one, the length floor and the pattern rules still apply. The committed
demo list is deliberately short; replace it, do not extend it in this repo.

> The browser-delivered vs server-only split is deliberate: what the web reads
> ends up in page source, so never put anything sensitive there, and nothing
> only the API needs either. Keeping the files separate keeps that line visible
> (ADR 0018).

Each file must be **complete** (no partial overrides), and an unknown key stops
the boot as surely as a missing one. The authoritative shape of each is its Zod
schema: `libs/shared/src/lib/deployment-config.ts` (read by both apps),
`apps/api/src/config/api-config.ts`, `libs/shared/src/lib/common-text.ts`,
`apps/web/src/app/config/app-text.type.ts`, `.../admin-text.type.ts`,
`apps/api/src/mail/mail-text.ts` and `apps/api/src/pdf/pdf-text.ts`. The
committed demo files are the worked example to copy from.

### What describes your shop

Most of these files are wording any shop of the kind would use. These are the
parts that are about one shop, and a new deployment rewrites all of them:

- `deployment.json`: `branding` (the name, the tagline, the logo's size, the
  colours, the first year of the copyright), `seller`, `contact`, `locations`
  and `mapProvider`, `pickup`, `delivery`, `elsewhere`.
- `texts/app.json`: `home`, `map`, `consent` and `footer`, first in the file.
- `assets/`: the logo and the favicon (below).
- The static pages — about, conditions, terms, privacy, imprint, withdrawal and
  the contact page's text — are written in the admin, not here. The privacy
  policy names the map provider too, so a change of provider changes it as
  well.

`branding.tagline` says what the shop is in a line. It is the landing page's
heading, and with the name the title of every page that has none of its own:
`Coffee Kontor — Wholesale specialty coffee`. `mapProvider` is who serves the
map embeds; the map notice and the cookie banner name it as `{provider}`.

### The locale

`locale` is the one language the deployment speaks, as a BCP 47 tag in its
canonical form (`"de-DE"`, not `"de_DE"`):

```json
"locale": "de-DE"
```

It is the language every page and mail declares — what a screen reader picks
its voice by — and the conventions every date, number and amount follows,
on the pages, in the mails and in the PDFs. Set it to the language the texts
are written in, with the region whose conventions the shop keeps. The
currency itself is `catalog.currency.code`.

### Keeping two words on one line

Where a phrase must never break across lines — a short label in a table column
the reader can drag narrow, a figure and its unit — write a non-breaking space
as the JSON escape ` `: `"paid in full"`. It is valid JSON, it
parses to a real non-breaking space, and unlike a pasted one it stays visible to
whoever edits the file next. Status badges do not need it: they never wrap.

### Texts nobody sees

A key ending in `Aria` is never on screen: a screen reader reads it out. It is
the name of an icon-only button, a hint only a screen reader hears, or an
announcement such as how many suggestions appeared. It can be a whole phrase
and need not fit anywhere, so word it to be heard. A tooltip is not one of
these — it shows on hover — so its key has no suffix. CI
(`tools/check-aria-text.mjs`) fails if an `…Aria` text is ever put on screen.

### The seller line

A jurisdiction that wants the seller identifiable on every page, not only on
the imprint, gets a line in the footer from `seller` in `deployment.json`:

```json
"seller": {
  "name": "Coffee Kontor GmbH",
  "registration": ["HRB 000000 Hamburg", "USt-IdNr. DE000000000"]
}
```

Each `registration` entry is written whole, label included, because which
numbers a seller quotes and what they are called is the jurisdiction's. The line
continues with the phone and email from `contact`, the same ones the header
shows. Where the footer should show something else — an email the header leaves
out, say — give the line a `contact` of its own; it then replaces the header's
entirely, so `"contact": {}` shows neither:

```json
"seller": {
  "name": "Coffee Kontor GmbH",
  "registration": ["HRB 000000 Hamburg"],
  "contact": { "email": "hallo@coffee-kontor.example" }
}
```

The line breaks only between entries. Leave `seller` out and there is no line.
The imprint page stays the place for the full seller details.

### A notice above every page

`notice` in `deployment.json` puts a line above the header of every page and
above the content of every mail: that the shop is a demonstration, or closed
over the holidays.

```json
"notice": {
  "text": "We are closed from 24 December to 2 January.",
  "link": { "label": "Opening hours", "url": "https://shop.example/pages/contact" }
}
```

The `link` is optional and follows the text. Its `url` is absolute, because a
mail has no page to resolve a path against. The notice cannot be dismissed, and
the order documents never carry it. It is a setting rather than a text key, so
a deployment without one simply leaves `notice` out; changing it is a config
change and a restart.

### Consent to processing personal data

Where a jurisdiction wants consent asked as a statement of its own, the shop
offers two purposes, each switched on its own:

```json
"consent": {
  "contact": false,
  "account": false
}
```

- `contact` is asked on the contact form. Its text is read at `/inquiry/consent`.
- `account` is asked on the registration form. For a customer account opened on
  the holder's behalf, it is asked instead on the page where they first choose a
  password. Its text is read at `/register/consent`.

Both keys are required. Switch a purpose on only where the processing rests on
consent. Leave it off where it rests on the contract or the shop's legitimate
interest, which is the usual case in the EU: the form then shows no box. The
demo leaves both off. A consent text is not a published page, so neither
`consent-contact` nor `consent-account` belongs in `pages.published`, and the
config is refused if one is listed there.

The text and the wording beside the box are written in the admin page editor,
not here. The admin panel lists the texts of the purposes switched on, beside
the search for a person's consent records. Every save is a new version. The
wording marks the words that open the text with square brackets, once:
`I [consent] to …`. A consent is recorded against the version the person saw. A
purpose switched on whose text was never written refuses its form rather than
sending it without the consent. So write the text before switching it on.

Whether or not a box is asked, the contact form, registration and checkout
carry a line pointing at the privacy page, worded by `privacyNotice` in
`texts/app.json`. It shows only where `privacy` is published.

### Terms of sale

Publishing `terms` gives the shop a page of terms that every order accepts.
Checkout says so beside the submit button, worded by `termsNotice` in
`texts/app.json`. Each order records the version of the terms current when it
was sent. Staff see that version on the order, and the customer's receipt and
the order summary name its date. A deployment that does not publish `terms`
records nothing and says nothing, and neither does one that publishes it before
anybody has written the page: write the terms before switching maintenance
mode off.

```json
"terms": {
  "attachToReceipt": true
}
```

The switch is in `api.json`, since only the API acts on it, and
`attachToReceipt` is required. Switch it on where the jurisdiction wants the
terms on a medium the customer keeps, which a link to a page that can change
is not: the receipt then carries the accepted version as a PDF, named by
`terms.fileName` in `texts/pdf.json`. The demo switches it on, as
an EU shop would. The PDF is set in the same face as the order summary, so a
deployment writing in a non-Latin script needs `branding.font.pdf` for it too.

The order summary prints `orderSummary.returnNotice` from `texts/pdf.json`
under the total, where it is set: the summary is the paper handed over with the
goods, so it can tell the customer in writing how to return them. Leave the key
out to print nothing.

Publish `withdrawal` only where the jurisdiction prescribes a withdrawal notice
of its own. Elsewhere, the return procedure belongs in the terms.

### Tax basis

Every deployment states the tax basis its prices are quoted on: `included`,
`added` (on the invoice) or `none`. The statement appears under every total
and on the conditions page. It is a statement, not a calculation: the platform
never works out a tax amount, because the shop's invoice states that figure.

```json
"tax": {
  "basis": "included",
  "rate": 19,
  "statedAtPrices": true
}
```

A basis that charges tax requires `rate`, the default rate as a percent with at
most two decimals, and `statedAtPrices`. Under `none`, write only the basis.
The basis belongs to the seller, never to a product. Goods taxed at a different
rate carry a rate of their own; they never carry a basis of their own.

Switch `statedAtPrices` on where the jurisdiction expects a consumer price to
say what it includes, as the demo does as an EU shop. The product page then
states the basis under the price, and the listings once under the products.
With it off, only the totals and the conditions page state the basis.
Where the price beside a product should say more, such as that delivery comes
on top, the optional app text `tax.atPrice` wraps the statement there
(`{statement}`); the demo's reads "{statement}, plus delivery", and its listing
lines say the same. Totals never carry it, since a pickup order has no
delivery.

A total names the rate its lines share. Once a cart or an order mixes goods
taxed at different rates, the total states only the basis and each line states
its own rate; staff screens state every line's rate regardless. An order keeps
the basis it was submitted under, so changing `basis` later restates nothing
the shop has already quoted.

The statements are `tax` in `texts/common.json`, one wording for the storefront,
the mails and the order summary; `tax` in `texts/app.json` holds only what the
storefront adds beside a price and under a listing, and `conditions.tax*` the
conditions page. `{rate}` is the rate written as the deployment writes numbers;
the `mixed` forms are the totals that name no rate.

### Retention

The platform keeps orders' personal details and two kinds of evidence about
personal data for a period, and removes each once its period has run out. A
sweep checks daily, starting a minute after the API boots.

```json
"retention": {
  "consentRecordDays": 1095,
  "destructionRecordDays": 1095,
  "orderDays": 1095
}
```

`retention` is in `api.json`, and all three keys are required, in days, because each period is a legal decision
for the deployment.

- `consentRecordDays` is how long a consent record is kept, counted from its
  withdrawal. A contact consent counts from when it was given, unless it was
  withdrawn. An account consent nobody withdrew is kept as long as the account.
- `destructionRecordDays` is how long a record that personal data was
  destroyed is kept. Such a record is written whenever an account is deleted, a
  registration is declined, the sweep deletes a consent record, or an order's
  personal details are removed. When the record itself expires, it is deleted
  without leaving another record.
- `orderDays` is how long a finished order keeps its personal details: contact,
  invoicing and delivery details, notes, and the documents supplied for it. An
  order is finished once it is completed, declined or cancelled and no payment
  is awaited, and the period counts from the last thing that happened to it.
  The order itself, its lines and its totals stay. Nobody is mailed; the privacy
  policy states the period.

The demo keeps all three for three years, about the length of a common
limitation period for claims.

### A code after the password

A deployment can ask the person to prove they hold the account's mobile number
after the password ([FR-AUTH-12](../../../docs/requirements.md#fr-auth-12)): by a
code sent to it, or by a call from it to a number the site shows. Which of the
two follows from the provider, below. The key is
optional, and absent means off. The demo leaves it out.

```json
"signInStep": {
  "mode": "always",
  "roles": ["user", "manager", "admin"],
  "exemptableRoles": ["manager", "admin"],
  "trustDeviceDays": 30
}
```

- `mode` is `off`, `once` or `always`. `once` asks once, to confirm the number,
  and never again: that is phone verification, not a second factor. `always`
  asks at every sign-in.
- `roles` lists who is asked. A role left out signs in with the password alone.
- `exemptableRoles` lists the roles an admin may exempt one account of, on the
  account's page, for instance a maintainer with no number in the deployment's
  country. Optional, and absent means nobody. The exemption is recorded with
  the admin and the date. Taking a role off the list ends every exemption of
  that role at once.
- `trustDeviceDays` lets the person tick "remember this browser" on the code
  or call screen, at `always` only. That browser then skips the step, never
  the password, for this many days. Signing out and changing the password leave
  it remembered; a changed number, or a disabled or deleted account, forgets
  every remembered browser. Optional, and absent or 0 means never, which is
  what a rule asking for the step at every sign-in wants.

Where an account takes the step, its number is how it signs in, and only staff
change it: the holder sees it on their account page but cannot edit it, and a
sign-in never asks for one. An account with no number the step can use cannot
sign in until staff enter one.

The provider is a sidecar of the deployment's own, set in the environment (see
`.env.example`), and a deployment sets one of the two:

- `SIGN_IN_CODE_URL`: codes, sent by the code sidecar. The text a code travels
  in is `signInCode.message` in `texts/mail.json`; keep it to one SMS, since a
  second part costs a second message.
- `SIGN_IN_CALL_URL`: calls, checked by the call sidecar. The site shows the
  number to call and goes on by itself once the call has come.

Without either, mail stands in: codes go to the account's email address, or,
with `SIGN_IN_MAIL_KIND=call`, a link that does what the call would. That is
fine for trying the feature out but is no second factor.

### How long a session lasts

A session renews while it is used and ends after `session.idleDays` (in
`api.json`) without use. Optional, and absent means 7. A deployment that asks for the step at every
sign-in usually sets it longer, so a customer who keeps coming back is rarely
asked: each new session is a message or a call to pay for. The demo leaves it out.

```json
"session": { "idleDays": 30 }
```

Changing the password, or a staff member disabling the account, still ends
every session at once.

## Assets (logo, favicon, fonts)

Per-deployment **assets** live in an `assets/` **subdirectory** of this mount:

```
config/
  deployment.json
  api.json
  texts/
  password-blocklist.txt
  assets/
    logo.svg
    favicon.svg
    favicon.png
    marktplatz.svg     # optional: one per "elsewhere" entry
    fonts/             # optional: @font-face css + woff2 files
```

The web SSR server serves `assets/` ahead of the baked static files: a request
for `/logo.svg` or `/favicon.svg` is answered from `config/assets/`.

> Only `assets/` is web-served — never the mount root. The `*.json` (especially
> the **server-only** `api.json` and `texts/mail.json`) sit beside it and are
> never reachable from a browser.

`logo.svg` is drawn as a **CSS mask**, not as an image: it takes the theme's
colours, so it answers a pointer with the accent like every other control in the
header. That means it renders in **one colour** whatever the file contains —
draw it as a single-colour mark, and let the shapes rather than the fills carry
it. Its companion in `deployment.json` is `branding.logo`, its intrinsic
`width` and `height` copied off the file. The header always draws the
logo 40px high, so these are not a display size — they are what lets the browser
keep the logo's space before the file has arrived, instead of letting the search
field beside it take the width and hand it straight back. Replace the logo with
one of another shape and these two go with it.

The **places the shop also exists** (FR-NAV-07) bring one icon each, beside the
logo and on the same terms — a single-colour mark, painted as a mask so the row
takes the site's own colours rather than reading as a strip of stickers. Each
entry in `deployment.json` names the file, where it goes and the words that
stand in for the mark:

```json
"elsewhere": [
  {
    "label": "Marktplatz",
    "url": "https://marktplatz.example/shops/coffee-kontor",
    "icon": "marktplatz.svg"
  }
]
```

The list is also the order the footer draws them in, beside the enquiry button;
leave it out for a deployment that is only here. A mark is boxed to the height
of the button beside it and drawn square; a mark of another shape states its
own with `"width"` and `"height"` (any unit, only the ratio counts — the
`viewBox` size will do), so its room is kept before the file loads.

A deployment that wants its own typeface adds `branding.font` to
`deployment.json`:

```json
"font": {
  "family": "'Some Sans', system-ui, sans-serif",
  "stylesheet": "fonts/fonts.css"
}
```

`emphasisWeight` (100-900) belongs in the same block: it is the weight a price
is set in, and how heavy that should be is a property of the face. The app ships
700, which is a clear step up from the body text in the system stack and too
much in a family whose medium and semibold are close together — set it there
rather than looking for the places a price is drawn.

A deployment whose paperwork should be set in the same face adds `pdf` beside
those two:

```json
"font": {
  "family": "'Some Sans', system-ui, sans-serif",
  "stylesheet": "fonts/fonts.css",
  "pdf": { "regular": "fonts/some-sans.ttf", "bold": "fonts/some-sans-bold.ttf" }
}
```

These are **`ttf` or `otf` files**, not the `woff2` the browser is served: a PDF
embeds TrueType or CFF, and a `woff2` put through the same machinery is tagged
as TrueType and then refused by some readers while rendering fine in others.
Both weights are needed — the layout sets its headings and its total in the
bold one.

Omit `pdf` and the API prints in a standard face every reader already has,
which covers the Latin alphabets with their accents and umlauts (WinAnsi) and
nothing beyond them. **A deployment whose catalogue or addresses are written in
any other script must name its own face here** — characters the standard one
cannot write are drawn as question marks rather than failing the document.

`family` is applied to everything the app draws. `stylesheet` is a path under
`assets/` holding the `@font-face` rules, linked into every document by the SSR
server; put the `woff2` files beside it and reference them relatively. Serving
them from the deployment's own origin rather than a font CDN is the point — a
CDN link makes every visitor's browser announce itself to a third party before
the page has drawn, which is also a consent question nobody wants to answer.
Omit `font` entirely to keep the system stack.

The document `<title>` is not an asset: it is built from `branding.name` and
`branding.tagline` in `deployment.json`, at runtime, so it needs no rebuild
either.

## Deploying a real deployment's config

`infra/deploy.sh` fills the VM's `/config` from `CONFIG_DIR`, which it requires:
a directory under `deployments/` for the demo stacks, and for a real deployment
its own directory of files (held in the private deployment repo), copied into
`/srv/b2b/<stack>/config` before the stack starts.

## When a release moves config keys or files

Every file is loaded whole, so a release that renames, merges or adds a key, or
moves a file, stops a deployment with the old files from booting. Such a
release ships a map in `tools/config-migration/<version>.json`, and the tool
applies it to a deployment's own config directory, keeping its wording and
settings:

```
node tools/migrate-config.mjs --release 1.14.1 --config-dir <dir>           # report only
node tools/migrate-config.mjs --release 1.14.1 --config-dir <dir> --write
```

Run it where the deployment's config is kept — for a real deployment, in the
change that moves it to the new release; for the ones in
[deployments/](../../README.md), in the change that moves the keys in
this one — never on the server at boot.

It needs Node and nothing else: no checkout and no `npm ci`. The script and
the release's map, downloaded from the release tag with the map in a
`config-migration/` folder beside the script (or passed with `--map <file>`),
are enough. With `--write` it writes the release's files and removes the ones
they replace. It reports what it cannot decide: wording new in the release
(written in English), settings new in the release (set to the demo's value),
keys merged from several old ones whose values differed in the deployment,
counting texts still written in two forms, and keys the release requires that
the deployment's files never had. A deployment several
releases behind runs each release's map in order.
