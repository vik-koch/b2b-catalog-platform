# 0071 — Keep the UI building blocks in a library apart from the app

**Status:** accepted · **Date:** 2026-10-27

## Context

The web app's building blocks (buttons, fields, dialogs, notices, icons) sat in
`apps/web/src/app/shared/ui/`, beside code that knows the domain. Nothing kept
them apart from it: a field could read the deployment's config, a primitive
could import a price rule, and only review noticed. The colour roles they draw
with lived in the app's stylesheet among the app's own rules.

A library was considered before and turned down as ceremony: one consumer, and
Nx tags already at project level. The consumer is still one. What changed is
that the line between a building block and the app is now the thing worth
keeping, and a project boundary is the one place lint can hold it.

Imports needed a decision of their own. Chunks are cut by module, not by
export, so a module re-exporting the library's files (an `index.ts`, or one per
group) puts everything behind it into the first load as soon as eager code
imports through it. A package marked `"sideEffects": false` did not change
that.

## Decision

`libs/ui` holds the building blocks that know nothing of the domain, the
deployment's texts or its config, and the design tokens they draw with
(`ui.css`). It is imported one file at a time
(`@b2b-catalog-platform/ui/forms/input`); there is no barrel.

## Rationale

- **The boundary is a check.** The library imports Angular and its own files;
  lint refuses `@b2b-catalog-platform/*` inside it, and Nx refuses an import from
  the app. What a piece needs from the app, its words or a locale, it is given
  through an input or a token the app provides.
- **Words by how they vary.** Words a piece says the same wherever it appears (paging,
  a grid's controls) come from a token the app fills from its texts, one token per
  audience: the public texts for any page, the staff texts for the admin's pieces.
  Words that depend on the use (a field's label, a dialog's question) are inputs. The
  library holds no wording of its own, not even a default.
- **Per-file imports keep chunks honest.** A page downloads the pieces it
  imports and nothing else; lint refuses a path that names the library or a
  group. The cost is one import line per piece.
- **Groups are folders** (`icons/`, `forms/`, `overlay/`, …), for reading, not
  entry points.
- **One library, not one per side.** A primitive does not know which side of
  the app it is on; a piece that does, or that knows the domain, is a
  composition and stays in the app.
- **The tokens move with the pieces** that draw with them, so the library is
  complete with its own stylesheet; the app's stylesheet imports it and adds
  its own rules.
- **Specs run through the app's build.** The library has no build of its own,
  so its test target points Angular's unit-test builder at the web app's
  development build.

## Consequences

- (+) A building block that reaches for the domain or the deployment fails
  lint, in the editor and in CI.
- (+) A page carries the pieces it uses, and the import line says where each
  one lives.
- (+) The tokens and the pieces that depend on them are read in one place.
- (−) One import line per piece; an IDE adds them, but a component that uses
  six pieces has six lines.
- (−) Moving a piece in can mean taking a dependency out first (its words, a
  locale, a domain rule passed in as a function).
