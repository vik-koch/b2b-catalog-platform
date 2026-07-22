# 0014 — Assemble email bodies from a per-feature text file now, defer a configurable HTML template

**Status:** accepted · **Date:** 2026-07-22

## Context

0013 established the `Mailer` port (`send({ to, subject, html, replyTo })`), so
HTML is already a first-class field on every send. What it did not decide is how
an email's **body** is produced. Email spans the whole FR-NOTIF-\* group
(registration, approval-with-password, order-status, manager notifications) plus
FR-AUTH mail and the FR-CART payment PDF, with FR-NAV-06 (the inquiry form) the
first and only sender today.

Two separable concerns live in a body: the **wording** (field labels and prose,
single-locale like the rest of the app) and the **presentation** (branding —
logo, header/footer, layout, a per-deployment custom intro). Presentation is
per-deployment, the same shape of concern as the frontend theme and config
(0008 runtime theming, 0009 config/text via transfer state): the demo shop and a
client will want different letterheads from one image.

Today the inquiry email is built in `inquiry.service.ts` from key–value rows
defined in `inquiry-text.ts` — a server-side text catalog (the API's analog of
the frontend `AppText`) rendered to minimal `<p>` HTML with no branding chrome.

Alternatives considered: (a) introduce a shared, per-deployment-configurable
HTML template layer (header/logo/footer + injected body + custom text) now, for
all mail; (b) keep body assembly in each feature from its own text file, plain
HTML, and defer the template; (c) pull in a templating engine (MJML/Handlebars).

## Decision

For now, each feature assembles its own email body from a per-feature key–value
text file (e.g. `inquiry-text.ts`) into minimal semantic HTML — no template
engine, no branding, no per-deployment HTML. A single configurable, branded HTML
template layer applied across all FR-NOTIF-\* (and other) mail — overridable per
deployment like `DeploymentConfig` — is **deferred** until a second email type
exists or a deployment needs branding.

## Rationale

1. **Right-sized: one sender exists.** A cross-cutting template system chosen
   against a single email would be speculative — we would be guessing the
   variation points from one example. YAGNI until the second sender shows the
   real seams.
2. **The seam already exists cheaply.** Wording is isolated in the text file, so
   adding a template later wraps existing bodies rather than rewriting each
   feature's content — deferring costs little.
3. **Branding is per-deployment config, not code**, mirroring 0008/0009. The
   eventual template belongs to that same runtime-config mechanism (built once,
   themed per deployment — 0007), so it should be designed with the second or
   third email type in view, not retrofitted from one.
4. **No premature engine choice.** MJML vs. Handlebars vs. hand-rolled is a real
   decision with its own dependency and testing cost; nothing today needs it.

Concession: current emails are plain and unbranded — acceptable for the demo and
the first notification, but a client expecting a letterhead will not be served
until the template lands. Option (a) would win the moment two email types share
a header, or a deployment demands branding; that is the trigger to revisit.

## Consequences

- (+) Minimal now: a new email is a text file plus a small render step; nothing
  shared to design or maintain yet.
- (+) Presentation stays separated from wording, so the future template is
  additive, not a rewrite.
- (−) Emails have no logo/header/footer or per-deployment custom text until the
  template layer exists.
- (−) Each sender repeats its own tiny HTML/plaintext rendering; accepted as
  duplication to be unified when the template arrives (watch for it as the
  signal to build option (a)).
