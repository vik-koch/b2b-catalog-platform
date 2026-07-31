# 0028 — Back up the media volume, and give the operator scripted off-box copies and restore

**Status:** accepted · **Date:** 2026-07-31

## Context

ADR 0017 gave the database scheduled logical dumps and closed NFR-OPS-04 for
Postgres, while explicitly parking two follow-ups:

> A second data class (catalog media) will need its own backup path once it
> exists; this ADR intentionally leaves that open.

> The dumps live on the same VM as the database, so this alone does not survive
> VM loss; getting a copy **off** the box … is deliberately left to a follow-up.

Both now bite. Uploaded images (0021) live in the `mediadata` volume and exist
nowhere else — the catalog references them by hashed filename, so a database
restored without them is a shop whose every product image 404s. And with dumps
and originals on one VM, the failure that actually ends a small deployment —
losing the box — loses both.

Restore was also documented as a single `zcat … | psql` line. That command
restores _onto_ an existing schema, which leaves a half-merged database rather
than the one that was dumped.

## Decision

- Add a **`media-backup` sidecar** (`offen/docker-volume-backup`) on the same
  `backup` profile as `db-backup`, archiving `mediadata` to `./backups/media`
  with prefix-based retention. It runs **after** the database dump.
- Add **`infra/backup.sh`** — takes a fresh dump + archive on the VM and
  downloads both, plus the stack's `.env`, to the operator's machine.
- Add **`infra/restore.sh`** — uploads a matched pair, stops the writers, drops
  and rebuilds the schemas from the dump, refills the media volume, restarts.

## Rationale

**Ordering is the correctness argument, not a scheduling detail.** Uploads are
append-only: a media archive taken _after_ a dump necessarily contains every
image that dump references. Taken before, it can miss images uploaded in
between, and the restore yields broken pages. Both the sidecar's cron offset and
`backup.sh`'s step order encode that direction, and say so.

**Off-the-shelf, consistent with 0017.** A tar-and-prune cron loop is easy to
write and easy to get subtly wrong (retention, symlinks, partial archives).
`offen/docker-volume-backup` is small, multi-arch (0007), and can later push to
remote storage — which is where the offsite half will land — without changing
the shape here. No docker socket is mounted: nothing needs stopping to copy an
append-only directory, so the container gets the volume read-only and nothing
else.

**Drop-and-restore over restore-in-place.** The dump recreates `drizzle` (the
migration ledger) and every `public` object. Restoring over existing objects
leaves duplicate-key noise and a schema that is neither the old one nor the new
one. Dropping both schemas first makes the result exactly the dumped database.

**Scripts over a runbook paragraph.** The sequence — stop writers, drop, load,
refill volume, start — is easy to get wrong at the moment it is needed most.

Rejected: a single script doing DB and media in one archive (couples two things
with different retention and different restore risk); PITR (still out of
proportion, see 0017).

## Consequences

- (+) NFR-OPS-04 now covers both data classes, on the same opt-in profile.
- (+) A restore is one command against a matched pair, and it has been
  rehearsed: media restored byte-identically (checksum equal), the database
  dropped and reloaded to identical row counts, and the app served catalog,
  pages and images afterwards.
- (+) `backup.sh` also pulls the `.env`, so what is downloaded is enough to
  stand the stack back up somewhere else.
- (−) Restore is destructive by design and replaces media wholesale: anything
  uploaded after the archive is lost. The script requires typing the stack name.
- (−) Off-box copies are still **operator-triggered**, not scheduled. Automating
  the push (the same sidecar can target remote storage) remains open.
- (−) Two sidecars on long-lived stacks, and `./backups` grows with two
  retention policies to keep an eye on.
