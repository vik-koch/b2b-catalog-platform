# 0048 — Store product documents unmodified, beside the media store

**Status:** accepted · **Date:** 2026-09-05

Amends ADR 0021, which admits images only.

## Context

Products carry certificates, declarations and data sheets — PDFs, sometimes a
scan as JPEG. A customer opens them from the product page and prints them.
ADR 0021's store re-encodes every upload to WebP at 1600 px, which is exactly
right for editor imagery and destroys a document. Requirements: FR-DOC-01/03.

Alternatives considered: a second storage backend; putting documents through the
media pipeline with a bypass flag; streaming them from disk through an API route.

## Decision

- **The same `MediaStore` port and the same volume, a different pipeline.**
  Documents are written as received, under a content-hashed name keeping the
  original extension; nothing is decoded, resized or re-encoded. It is a
  **second port method** (`putDocument`) rather than a flag on the existing
  one: the two pipelines share a volume and a naming scheme, and nothing
  else.
- **Accepted types are PDF and the image types 0021 already sniffs**, by content
  sniffing, with a size cap of their own. SVG stays rejected.
- **Served read-only at `/documents/<hash>.<ext>`** by the same nginx, with
  `Content-Disposition: inline` and a long cache lifetime, never through the API
  process.
- **The file is not the identity.** A document row owns its title, dates and
  product links; replacing the file rewrites the row's pointer, and the prune
  sweep collects the bytes nothing points at any more. Documents are a
  subdirectory of the media root with their own reference sources, so the two
  sweeps cannot mistake one kind's files for the other's orphans.

## Rationale

**A document that is not byte-identical is not a certificate.** Re-encoding
would cost a signed page its fidelity and would drop a PDF entirely, so the
pipeline is skipped rather than parameterised — a "do not touch this one" flag
threaded through code whose whole purpose is to touch the bytes is a branch
waiting to be taken by accident.

**Serving unmodified bytes from a public path is the risk 0021 already took**,
and the mitigations are the same: a generated filename, a sniffed type, an
allowlist that keeps SVG and HTML out, and a static server that executes
nothing.

**Content hashing gives the replacement story for free.** A re-issued document
produces a new hash and so a new URL, nothing is served stale, and the bytes it
replaced are unreferenced — which is precisely what the sweep already deletes.
Deleting them at save time would be wrong as well as redundant: two rows that
uploaded identical bytes share one stored file.

## Consequences

- (+) Backups and the operator restore path (ADR 0028) cover documents unchanged
  — they are files on the same volume.
- (+) The port's adapter seam is untouched, so an S3-compatible adapter still
  swaps in for both kinds.
- (−) Documents are larger than images and are never downscaled, so volume
  growth now follows what the admin uploads. The size cap is the only brake.
- (−) A document URL is unguessable but public. That is the intended reach for a
  certificate; anything confidential must not be uploaded here.
