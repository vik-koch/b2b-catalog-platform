# 0021 — Serve editor images from a media store port, never inline or hotlinked

**Status:** accepted · **Date:** 2026-07-27

## Context

Rich-text bodies (0020) need images: a delivery provider's logo on a conditions
page, a photo on about-us, and later product imagery (FR-ADM-01). On top of the
text format that raises three questions, each with a tempting shortcut: where the
bytes live, how the body references them, and how placement is expressed without
reopening the sanitizer allowlist 0020 kept deliberately narrow.

## Decision

- **Files, never inline.** Upload goes to an admin-only endpoint that returns a
  stable `/media/<contenthash>.webp` URL; the body references it as
  `<img src="/media/…" alt="…">`. `data:` URIs are rejected — they defeat HTTP
  caching and bloat the per-slug SSR HTML cache the architecture depends on.
- **Storage behind a `MediaStore` port** (interface public, adapter swappable —
  the same seam as the mailer, 0013). The shipped adapter writes to a mounted
  volume; a tiny nginx serves it read-only at `/media`, routed by the shared
  Traefik (0005), which is a reverse proxy, not a file server. An S3-compatible
  adapter is possible later with no call-site change.
- **One stored representation: a re-encoded WebP.** Every accepted upload
  (PNG/JPEG/WebP/GIF) is decoded, EXIF-rotated, downscaled to at most 1600 px
  wide (never enlarged), stripped of metadata, and written as `<hash>.webp`.
  `sharp` is the single authority for both sniffing and encoding — the type comes
  from decoding the bytes, never the client's `Content-Type` or extension. SVG is
  rejected (script-capable, and `sharp` reports it outside the accepted formats).
- **Uploads are validated server-side:** admin role, allowlisted image types by
  content sniffing, a size cap, and a generated filename — the client's filename
  never reaches the filesystem.
- **`img` joins the 0020 allowlist** with exactly `src`, `alt`, `data-align`
  (`left|center|right`), and `data-width` (integer percent, 1–100). `src` **must**
  match our own `/media/<single-segment>` — absolute, protocol-relative, and
  traversal paths are rejected, not rewritten. `alt` is forced (empty allowed).
- **Placement is styled by us, not by the author.** `data-align` maps to our own
  CSS (`center` block with auto margins; `left`/`right` float so text wraps; both
  collapse to full-width on narrow viewports). `data-width` is validated by
  pattern and _reconstructed_ into a width-only inline style (`width:N%`) — the
  sanitizer never parses an author-supplied `style`, so no CSS parser enters the
  trust boundary. This is the one deliberate relaxation of 0020's "no `style`".
- **Orphans are pruned in-process.** The running API server sweeps on a timer
  (`MEDIA_PRUNE_INTERVAL_HOURS`), deleting files no stored content references.
  References are recomputed each run from a registry of sources — mark-and-sweep,
  not reference counting, so nothing can drift. A grace window
  (`MEDIA_PRUNE_GRACE_HOURS`) spares a file uploaded but not yet saved into a
  body, and `MEDIA_PRUNE_DRY_RUN` logs candidates without deleting.

## Rationale

1. **URLs keep the caching model intact.** Images get their own cacheable,
   content-hashed responses; the HTML row stays small, so the SSR per-slug cache
   keeps its size profile. `data:` URIs would re-transfer on every render.
2. **Same-origin `src` is a security property, not a style rule.** An external
   `src` leaks every visitor's IP/referer to a third party and adds a live uptime
   dependency; restricting to our prefix removes both (mirrors 0010).
3. **Closed value sets are allowlistable; CSS is not.** `data-align` and a
   validated `data-width` express every layout these pages need while keeping the
   sanitizer a string comparison — no CSS parser, a known bypass source.
4. **A volume is the right size.** A few dozen admin images on one VM need no
   object store; the port is there for the day a deployment wants regional
   redundancy or multi-gigabyte scale.
5. **In-process prune, not a sidecar.** Unlike the `db-backup` sidecar (0017),
   which wraps off-the-shelf `pg_dump`, the prune is our own code already in the
   API image, and the platform runs a single API process — so the server owns the
   schedule directly, avoiding an always-idle container and a Docker socket.

Concession: the local adapter ties image durability to the VM volume, so a host
rebuild must restore it. The media volume is **not** in the postgres backup job
(0017) — a long-lived deployment must include it in its filesystem/volume
backups, the same tier as `./backups` and `./config`. Object storage is the
trigger to switch adapters if that ever becomes constraining.

## Consequences

- (+) Images are available to pages and, unchanged, to the product catalog.
- (+) The sanitizer allowlist grows by one tag and four attributes, all closed or
  pattern-validated — no CSS parsing, no URL trust decisions at render time.
- (−) The admin cannot hotlink an external image, by design; a logo is uploaded.
- (−) A media volume and a small nginx service join the compose stacks, and the
  `/media` Traefik route points at that nginx.
- (−) If a CSP is added later, its `style-src` must permit the inline `width:N%`
  on this content (or wait for universal `attr()` support). There is no CSP today.
- (⚠) The prune's reference registry is a safety boundary: a new column or entity
  that can hold media (e.g. product descriptions, FR-ADM-01) MUST be added to it
  in the same change, or the sweep will delete live images.
