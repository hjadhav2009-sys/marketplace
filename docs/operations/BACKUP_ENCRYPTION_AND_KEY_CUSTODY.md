# Backup encryption and key custody

## Status

`OWNER_APPROVED_STAGE3_POLICY`; `PRODUCTION_DURABLE_BACKUP_LOCATION_PENDING`.

The owner approved this policy for release planning during Phase 7.3.6 Stage 3. No encrypted durable production-backup location has yet been selected. That blocks production deployment but does not block private synthetic staging. ACL restriction is not encryption.

## Required production policy

- Durable release backups must be encrypted at rest using an owner-approved Windows volume, encrypted removable medium, or managed encrypted backup service.
- Recovery keys must not be stored beside the backup, in the repository, in `.env`, or in application storage.
- At least one recovery-key copy must be held outside the production computer by the owner in an approved offline or secure credential location.
- Recovery-key use and rotation must be audited without recording the key value.
- An off-device copy must have equivalent encryption and access controls.
- Backup manifests contain hashes and metadata, not secrets, but remain private because file inventories and counts may be sensitive.
- Encryption status must be verified before retaining a copied production backup. NTFS ACLs alone permit only a temporary rehearsal copy.

## Stage 2 handling

The Stage 2 rehearsal directory inherited no broad access after it was restricted to the current execution identity and `SYSTEM`. Windows volume protection could not be confirmed, so the durable copied backup and all restored application copies were logically deleted after verification. Only ignored, ACL-restricted reports remain.

No claim of secure SSD erasure is made. Normal deletion is logical deletion; strong disposal requires an encrypted-volume/key-destruction policy or approved media sanitization.

Recovery keys must never be stored in Git, the repository, `.env`, staging reports, normal console logs, chat, or beside the encrypted backup.
