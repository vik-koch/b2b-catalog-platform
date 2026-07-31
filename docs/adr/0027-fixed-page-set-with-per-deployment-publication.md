# 0027 — Keep a fixed page set, make publication and placement per-deployment

**Status:** accepted · **Date:** 2026-07-31

## Context

FR-ADM-03 gives the admin rich-text editing over a fixed set of static pages
(about, conditions, privacy, imprint), created and deleted by nobody. Two
pressures arrived at once:

1. Not every deployment needs every page. Whether a separate imprint page is
   required is a jurisdictional question; elsewhere the same seller details
   customarily sit on an about or contact page. Shipping a page a deployment
   does not want means either an empty page in the footer or a code fork.
2. The contact page's prose was not editable at all. It lived in
   `app-text.json` as `contact.intro`, so changing a sentence meant editing
   deployment config, while every comparable page's prose was admin-editable.

The alternative seriously considered was going the other way: drop the fixed
slug set and build a small CMS — page create/delete, an admin list with slug,
title, nav placement and ordering.

## Decision

Keep the slug set fixed in code. Add a `pages` block to the deployment config
declaring which pages this deployment publishes and where they are linked
(`published`, `headerNav`, `footerNav`). Give `contact` an editable page body
while keeping it on a code route, and split `STANDALONE_PAGE_SLUGS` out of
`PAGE_SLUGS` to say which pages the generic `/:slug` route serves.

## Rationale

A CMS would have forced a hybrid anyway. Two compliance surfaces link to
`/privacy` from code — the cookie banner and the inquiry form's consent
checkbox — so a delete-capable CMS needs an undeletable core set on top of the
free one: both models at once, which is more machinery than either. Free slugs
also collide with nine reserved top-level route segments, turn `canMatch` from
a compile-time array into a runtime lookup, and move nav labels out of the text
catalog into the entity.

Against that cost: a wholesale shop adds a static page approximately never, and
adding one today is a slug in the enum, a seed, a nav label and a footer entry —
a small PR. Building a CMS to avoid that is paying continuously to avoid a cost
incurred every few years.

What deployments actually vary is _presence and placement_, not page count, and
that needs no entity changes at all — hence the config block. A CMS would win
under different constraints: a deployment that publishes marketing landing
pages on its own cadence, or one where non-technical staff must add pages
without a release. Neither describes this product.

Contact keeps a code route because the office list and map embeds are
structured config, not prose. That preserves the standing split — navigation,
layout and interactive widgets are code; prose is content — rather than
bending it.

## Consequences

- (+) A deployment turns a page off with one config line, and the page becomes
  unreachable everywhere at once: route, both navigations, the admin panel and
  the sitemap. The row stays in the database, so turning it back on is a config
  change rather than a restore.
- (+) Contact prose is edited in the app like every other page, through the
  same editor and the same edit-mode pencil.
- (+) Nav placement and order are per-deployment without dynamic pages, which
  covers most of what a CMS would have been asked for.
- (−) Adding a genuinely new page is still a code change plus a release.
- (−) `pages.published` and the nav lists can disagree; a config-load refinement
  rejects a nav entry pointing at an unpublished page, so the failure is at boot
  rather than a 404 in the footer of every page.
- (−) `PAGE_SLUGS` and `STANDALONE_PAGE_SLUGS` must be kept in step; the latter
  is `satisfies readonly PageSlug[]`, so a typo is a compile error.
