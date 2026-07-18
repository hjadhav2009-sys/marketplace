# Backup retention policy

## Status

Proposed policy—owner approval pending. It does not authorize automated deletion of production backups.

## Proposed generations

- Pre-deployment: one new verified generation for every production migration or application rollout.
- Daily: retain 14 successful generations.
- Weekly: retain 8 successful generations.
- Monthly: retain 12 successful generations.
- Failed or incomplete backup: remove only its unpublished temporary directory after preserving bounded diagnostics.
- Manifest and restore evidence: retain for at least as long as the corresponding backup generation.
- Off-device: retain at least one encrypted, recently restore-tested generation.

## Controls

- Every generation is immutable and has a unique backup ID and directory.
- Never overwrite, append to, or recursively include an older generation.
- Cleanup requires a fresh verified backup, an owner-approved deletion plan, and confirmation that no legal, audit or incident hold applies.
- Record counts, generation IDs and dates without publishing private paths, filenames or data.
- Test restoration periodically on isolated infrastructure.
- Key/recovery custody follows [BACKUP_ENCRYPTION_AND_KEY_CUSTODY.md](./BACKUP_ENCRYPTION_AND_KEY_CUSTODY.md).

## Stage 2 result

The copied rehearsal retained no durable production backup because encryption and key custody were not confirmed. Disposable restore and application state were deleted. Private manifests and safe reports remain under an ignored, ACL-restricted local directory until the owner decides their retention.
