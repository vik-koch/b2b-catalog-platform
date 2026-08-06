# 0033 — One branded layout, one template per message, wording in config

**Status:** accepted (supersedes 0014) · **Date:** 2026-08-06

## Context

0014 deferred a shared email template deliberately, and named its own trigger:
revisit "the moment two email types share a header, or a deployment demands
branding". Iteration 4 trips it. FR-NOTIF-01/02/04 add three messages
(registration received, account approved with a generated password, a new
registration for staff) and FR-AUTH-02 will add a password reset — and unlike
the inquiry, which goes to the shop's own inbox, these are the first mail the
platform sends to a **customer**. Unbranded `<p>` tags carrying a password are
not something a client can put their name on.

What 0014 built is exactly the seam it promised: wording already lives in a
mounted, Zod-validated file (`inquiry-text.json`), separate from rendering. So
this decision is about presentation and structure, not about rescuing content.

Two things constrain the presentation, and they are not the web's constraints.
Email clients are not browsers: no flexbox or grid, `<style>` blocks are
unreliable, and Outlook renders through Word — so layout is tables with inline
styles or it is nothing. And **remote content is blocked by default** in most
clients until the reader opts in, which decides the logo question: an `<img>`
logo is invisible to the majority of recipients on first open, and the config
asset is an SVG, which email clients support poorly regardless.

Alternatives considered: a templating engine (MJML compiles to exactly this kind
of table markup, Handlebars/Nunjucks for the content) — a dependency, a build
step and a second language for four short messages; per-feature rendering as
today, extended — the duplication 0014 flagged as its own revisit signal, now
multiplied by four; and shipping a PNG logo variant in `config/assets/`,
referenced absolutely or attached by CID — a new per-deployment asset and a
delivery mechanism, for something half the readers never see.

## Decision

Every message is a `MailContent` object (subject, preheader, heading,
paragraphs, label/value rows, at most one action) built by a named template
function, rendered by one shared table-based layout, and sent through
`MailService`; wording lives per message in `config/mail-text.json`, and the
branding is the shop name as a typographic wordmark on a band in the
deployment's primary colour — no image, no external reference of any kind.

## Rationale

The content/presentation split is what makes this small. A template decides
_what is said_ and nothing else; the layout decides how it looks, once. Adding a
message is a function returning an object plus a section in the wording file —
no markup, no styling decision, and no way for one mail to drift from the rest.
That is also why HTML-escaping lives in the layout: an inquiry message is
attacker-controlled text going into an HTML mail, and a per-template escape is a
per-template chance to forget.

The plain-text alternative is rendered from the same object rather than stripped
from the HTML, so it stays readable, and a template cannot ship one part without
the other.

Branding is typographic because of the blocked-images constraint above, not to
save effort: a wordmark renders identically for every recipient on first open,
where a logo would show a broken-image placeholder to most of them. The layout
takes the shop name and primary colour from the same mounted `deployment.json`
the web app already validates — so the API now loads that file too, through a
deliberately narrow, non-strict schema covering only `branding`, since the pages
and map keys beside it belong to the web. Links are absolute from `APP_ORIGIN`,
newly required in the API's server mode: mail is read outside the app, where
nothing relative resolves. Should a deployment later want a real logo, the seam
is one field in the layout, and this ADR is the record of why the default is not
one.

No engine, on the same right-sizing grounds 0014 argued: MJML's output is the
markup written here by hand once, and a second template language would be a
dependency to maintain for four messages whose structure is a heading, some
prose, some rows and a button.

The replacement is total, not additive. `config/inquiry-text.json`,
`inquiry-text.ts` and the `renderHtml`/`renderText` helpers in
`inquiry.service.ts` are **deleted**; `INQUIRY_TEXT_FILE` becomes
`MAIL_TEXT_FILE` and the inquiry becomes one section of `mail-text.json`.
Keeping the old mechanism beside the new one would leave two ways to send mail
and one of them ugly. Adding required keys to a config file is a minor release
here, so the rename is not a breaking change — but it _is_ a config change every
deployment must make, and the config README says so.

## Consequences

- (+) A new message costs a template function and a wording section; it is
  branded, escaped, and has a text part automatically.
- (+) The layout is one file with one test suite — the escaping rule, the
  no-external-references rule and the text alternative are asserted once, for
  every message that will ever exist.
- (+) Wording stays deployment-owned and release-free, as it already was.
- (−) The API now depends on `DEPLOYMENT_CONFIG_FILE` and `APP_ORIGIN`, so a
  stack that mounts config only into the web container fails to boot. Compose
  and the config README are updated; a private deployment's env must follow.
- (−) The hand-written table markup is not covered by any preview tooling; what
  it looks like in Outlook is verified by eye through Mailpit, not in CI.
- (−) Messages are limited to the block set the layout offers. That is the point,
  but a message wanting something genuinely different (an order table, a PDF
  cover note in iteration 6) will have to extend the layout rather than style
  itself.
