# 0011 — Cookie consent: one deployment flag, a binary choice, no categories

**Status:** accepted · **Date:** 2026-07-21

## Context

NFR-LEGAL-03 requires a cookie-consent mechanism that gates non-essential
cookies **where the deployment's jurisdiction requires it**. Under EU
ePrivacy/GDPR, consent is needed only for non-essential storage; strictly
necessary storage (the auth JWT cookie, the consent record itself, CSRF) is
exempt and always allowed. Other jurisdictions impose no such rule. Today the
app sets only strictly-necessary storage, so no consent is yet required — but
the mechanism must exist for when analytics or a cookie-setting embed (0010)
arrives.

## Decision

- A single deployment flag, `cookieConsentEnabled` (0009), decides whether
  consent is enforced for the deployment.
- A **binary** choice — accept / reject, no cookie categories.
- Non-essential storage/embeds check `ConsentService.canUse()`
  (`!enabled || choice === 'accepted'`); strictly-necessary storage is set
  regardless.
- The decision is a **versioned record in localStorage** (client-only, itself
  strictly necessary); bumping the version re-solicits consent. The banner shows
  only when enforced and undecided; a footer "Cookie settings" control withdraws.

## Rationale

1. **One flag covers both jurisdictions.** Flag off → no banner _and_ no gating
   — correct for a no-rules jurisdiction and for the necessary-only state today.
   Flag on → non-essential storage waits for acceptance. Exactly
   NFR-LEGAL-03's "where required."
2. **Binary, not categories.** Only one optional bucket is foreseen; category
   toggles (analytics vs marketing) would be machinery for a need that does not
   exist, and can be added later without changing the flag.
3. **localStorage, not a cookie.** The record is client-only and off every
   request; remembering a choice is itself strictly necessary, so it needs no
   consent.

## Consequences

- (+) Compliant by default: off until a deployment opts in, which is also when
  the first non-essential storage lands.
- (+) Login and other necessary storage are never blocked by the banner.
- (+) `canUse()` is a single checkpoint reused by any consent-gated widget
  (first: maps, 0010).
- (−) No granular categories; running analytics _and_ marketing under separate
  toggles would need a richer decision model and banner.
- (−) The flag and consent copy are deployment config (0009) — changed by
  redeploy, not admin-editable at runtime.
