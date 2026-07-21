# 0013 — Send all email through a Mailer port with an SMTP adapter

**Status:** accepted · **Date:** 2026-07-21

## Context

Email is pervasive across the requirements: FR-NOTIF-01…05 (registration,
approval-with-password, order-status, manager notifications), FR-AUTH-01/02
(signup, password reset), FR-CART-05 (payment PDF), and FR-NAV-06 (contact
form — the first consumer). So this is shared infrastructure, not a one-off.

Two forces shape it. The email provider differs **per deployment** — each
deployment brings its own — which is the region-specific-integration seam the
project reserves for ports-and-adapters. And dev/test must send **no real
email**.

Alternatives considered: (a) a specific provider SDK (Resend/SendGrid/SES)
wired in directly; (b) an SMTP adapter behind a `Mailer` port; (c) an app-side
queue/outbox from day one.

## Decision

- A public **`Mailer` port** (`send({ to, subject, html, replyTo })`); all
  email goes through it.
- One universal **SMTP adapter** (nodemailer). SMTP is the lowest common
  denominator every provider speaks, so host/port/user/pass/from are deployment
  config (secrets) — a non-SMTP provider API, if ever needed, is a private
  adapter behind the same port.
- **Mailpit** (SMTP sink + web UI + REST API) is the **dev and demo** backend;
  the demo exposes Mailpit's UI (basic-auth, demo-only) as the reviewer inbox.
  Client prod uses real SMTP and ships no Mailpit.
- **Synchronous send** for now — no queue/outbox; failures surface as errors.
- **No message persistence.** Log send metadata (to/subject/status/timestamp),
  never PII bodies. Mailpit is the only archive (dev/demo).

## Rationale

1. **SMTP keeps the app provider-agnostic** and covers the region-specific case
   with config alone — matching ports-and-adapters and build-once-promote
   (0007): one image, per-deployment config.
2. **Mailpit mirrors the Postgres-in-a-container pattern:** real protocol, no
   real sends, assertable via its API in e2e — and its UI doubles as the demo
   reviewer inbox, so no bespoke inbox UI is needed to start.
3. **Sync + no-outbox is right-sized:** low volume today; a queue/outbox is a
   reliability decision that belongs with high-volume order notifications.
4. **Not storing messages** avoids a PII store and an admin surface we don't
   need; metadata logging gives observability without the privacy cost.

Concessions: a provider SDK would give better deliverability analytics and
easier DKIM than raw SMTP — traded for provider-neutrality, and those providers
also expose SMTP, so they still work behind the adapter. Sync send couples
request latency to the SMTP server; acceptable at this volume, with the outbox
as the escape hatch. No server-side history until that outbox exists.

## Consequences

- (+) One code path for all FR-NOTIF/FR-AUTH mail; a new notification just
  calls the port.
- (+) Per-deployment provider is pure config; a client's provider is
  credentials, not code.
- (+) Dev/e2e send nothing real; the demo's Mailpit UI is the reviewer inbox.
- (−) No retries or server-side history until an outbox is added (deferred).
- (−) Deliverability (SPF/DKIM/DMARC) is a per-deployment DNS chore, not solved
  by the app.
- (−) Sync send ties request latency to SMTP availability.
