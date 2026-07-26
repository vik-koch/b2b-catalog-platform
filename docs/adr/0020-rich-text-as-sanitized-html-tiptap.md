# 0020 — Store rich text as sanitized HTML, edit it with a schema-constrained Tiptap

**Status:** accepted · **Date:** 2026-07-25

## Context

FR-ADM-03 requires the admin to edit the body of a fixed set of static pages
(about, conditions, privacy, imprint). The needed formatting is small and
known: bold, italic, headings, bullet/numbered lists, links. The same editor
will later serve product descriptions (FR-ADM-01), so the decision is not
page-local.

The existing shape already leans one way: `pages.bodyHtml` is a `text` column,
the shared contract ships `bodyHtml`, and the `Page` component renders it with
`[innerHTML]` into a Tailwind `prose` container. Architecturally, SSR serves
these routes and caches the rendered HTML per slug, invalidated on admin save.

Two questions were open: **what to persist** — HTML, or an editor's own JSON
document tree the way most CMSs do — and **which editor package** to adopt.
Alternatives considered for storage: (a) HTML; (b) ProseMirror/Lexical JSON.
For the editor: Tiptap, Quill, CKEditor 5, Lexical, raw `contenteditable`.

## Decision

- **Persist sanitized HTML.** `bodyHtml` stays; no document-tree column.
- **The API is the trust boundary.** The pages service sanitizes against an
  explicit allowlist _on write_, and stores the sanitized result — so every
  read, and the SSR HTML cache, is clean by construction. `sanitize-html`
  (no DOM emulation dependency). Seeded content goes through the same function;
  there is no unsanitized path into the column.
- **Allowlist:** `p br strong em u s h2 h3 h4 ul ol li blockquote hr a`. On `a`,
  only `href` (schemes `http`/`https`/`mailto`) plus a forced
  `rel="noopener noreferrer"`. No `class`, no `style`, no `on*`, **no `h1`**
  (the page title owns the `h1`; bodies start at `h2`). **No tables** — see
  Rationale. `img` is added by 0021. `u`/`s` (underline, strikethrough) are
  included: harmless inline formatting the shared editor also serves product
  copy with, so one vocabulary covers both.
- **Editor: Tiptap** (MIT, on ProseMirror), used headless, with its schema
  configured to exactly the allowlist above, wrapped in an Angular standalone
  component implementing `ControlValueAccessor`.
- **Angular's `[innerHTML]` sanitizer stays** as a second layer. The server
  allowlist must remain a subset of what Angular permits, asserted by a test.
- **No version history.** Only the latest snapshot is stored — no revisions
  table, no restore. A page carries `updatedAt` (shown publicly as its
  last-changed date) and `updatedBy` (audit only, never exposed).

## Rationale

1. **HTML keeps SSR trivial.** With HTML in the column, rendering is
   `[innerHTML]` and the per-slug SSR cache is the stored value. JSON would
   require a renderer that behaves identically in the browser and in Angular
   SSR and stays locked to the editor's schema version — a permanent tax for a
   four-page CMS.
2. **HTML outlives the editor.** A document tree is one library's schema; a
   major-version schema change becomes a data migration. HTML is also
   reviewable in a git diff, which matters for seeded content.
3. **"HTML must be sanitized" is not a discriminator.** JSON must be sanitized
   too the moment it is rendered, and the API accepts whatever a client sends
   regardless of format. Sanitizing once, on write, is the smaller problem.
4. **Tiptap is headless and HTML-native.** `getHTML()` is its natural output,
   there is no bundled theme fighting our Tailwind-owned primitives (0008), and
   its schema is configurable — so the editor _cannot_ emit what the allowlist
   would strip, making the two layers agree instead of silently disagreeing.
5. **Rejected editors.** CKEditor 5 is GPL-or-commercial — a non-starter for an
   MIT repo. Quill bundles a theme and is Delta-native, making HTML a lossy
   export. Lexical is excellent but React-first with HTML as a secondary path.
   Raw `contenteditable` means reimplementing ProseMirror, worse.
6. **History would be write-only data.** Without a restore UI a revisions table
   is never read, yet costs a table, a write per save, and unbounded growth;
   the real safety net for four rarely-edited pages is the database backup
   (0017). If restore is ever wanted, it can be added then — the half-measure
   (recording revisions nobody can retrieve) is the one option worth refusing.
7. **No tables for now.** Tables are the largest slice of editor UI and CSS work
   (responsive overflow inside `prose`) for content four legal/about pages are
   unlikely to need. The extension is MIT and additive: an allowlist entry, a
   schema entry, a toolbar button.

Concession: JSON wins under different constraints — many content types, complex
embeds, or multiple render targets (web + native + email). None apply here.

## Consequences

- (+) FR-ADM-03 needs no renderer, no new column, no contract change beyond the
  admin mutation; the SSR cache keeps working exactly as designed.
- (+) One sanitizer, on one write path, covers pages and later product copy.
- (+) The stored value is always safe, so a future consumer of `bodyHtml` cannot
  reintroduce an XSS by forgetting to sanitize on read.
- (−) Sanitizing on write is lossy and irreversible: a disallowed construct is
  gone, not flagged. Accepted — the editor cannot produce one, so this only
  fires on a hand-crafted request.
- (−) Two allowlists (server, editor schema) must be kept in step; the subset
  test catches drift but they are not generated from one source.
- (−) Adding a formatting feature is a three-place change (schema, allowlist,
  toolbar) rather than a single editor config flag.
