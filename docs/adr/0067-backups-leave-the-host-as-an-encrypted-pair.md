# 0067 — Send each night's backup off the host as an encrypted pair, to storage the host cannot erase

**Status:** accepted · **Date:** 2026-10-09

## Context

NFR-OPS-04 (amended 2026-10-09) asks that a deployment can have its backups
leave the host on schedule, encrypted, to storage the host can add to but not
delete or replace. Until now (0017, 0028) both sidecars wrote to the VM's own
disk, and the copy off it was `infra/backup.sh`, run by hand. Losing the VM
lost every backup with it.

What a destination has to survive decides where it is. A provider's VM
snapshot and a network disk in the same region share the VM's account, and the
disk is mounted on the VM, so root on the VM reaches it. Neither survives a
compromised host or a lost account. Object storage reached by its own
credentials can, and nearly every provider offers it behind the S3 API.

## Decision

- The `media-backup` sidecar archives the **latest database dump together with
  the media volume**, as one archive. It keeps writing that archive locally, and
  when a deployment sets the `BACKUP_S3_*` settings it also uploads it to any
  S3-compatible bucket. A deployment sets all of those settings or none.
- The archive is **encrypted to an age public key** before it is written. The
  private key never sits on the host.
- The host's bucket key may **only upload**. The bucket is versioned, and a
  lifecycle rule on the bucket expires copies. The sidecar never prunes the
  bucket (`BACKUP_SKIP_BACKENDS_FROM_PRUNE=s3`). Where a provider's keys cannot
  be narrowed that far, a bucket lock rule, which refuses deletes and
  overwrites for a period, does the same job.
- A second, read-only key, held by the operator and never on the host, lets
  `infra/backup.sh` fetch a pair from the bucket and `infra/restore.sh` restore
  it.
- The `db-backup` sidecar keeps its local daily/weekly/monthly dumps unchanged.

## Rationale

**One archive makes the pairing a fact rather than a schedule.** 0028 matched
the pair by running the media archive after the dump. Putting the dump inside
the archive keeps that order and makes it impossible to restore the wrong pair.
If a night's dump fails, the archive carries the previous one. That is still a
consistent pair, because uploads are append-only.

**Upload-only plus versioning is what makes the storage safe from the host.**
Without delete rights the host cannot remove a copy. It could still overwrite a
name, and versioning keeps the version it replaced. Expiry belongs to the
bucket for the same reason, because pruning from the host would need exactly
the delete right this withholds.

**The S3 API is already the port.** Choosing a provider is an endpoint, a
bucket and two keys in deployment config, so the public repo names none and the
demo and a client use the same code path. The demo's prod stack proves it
against a free tier. Its dev stack keeps local copies only, and the ephemeral
demo still takes no backups.

**Public-key encryption keeps a stolen host from reading the backups too.** A
passphrase would have to sit on the host to encrypt. A public key there
decrypts nothing.

Rejected: a disk beside the VM, which shares its fate; a second sidecar or an
rclone job to upload the dump separately, which adds a moving part and gives up
the single-archive pairing; pruning from the host with a key that can delete.

## Consequences

- (+) A lost or compromised host no longer takes its backups with it, and
  nobody has to remember to copy them.
- (+) Leaving a deployment's backups on the host is still a valid setting:
  leave the S3 settings unset.
- (−) Losing the age private key makes every off-site copy unreadable. It is
  kept like the panel credentials, by the operator and the shop.
- (−) Versioning and the lifecycle rule are set on the bucket once, by hand,
  with an account key. The infra README carries the steps and a test that the
  host key cannot delete.
- (−) The off-site copies are daily only, kept for the bucket's expiry period.
  The weekly and monthly dumps stay on the host.
- (−) A deleted person survives in off-site backups until they expire. The
  personal-data account (NFR-LEGAL-13) states that period.
