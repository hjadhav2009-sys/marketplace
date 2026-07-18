# Backup retention policy

## Status

`OWNER_APPROVED_RECOMMENDED_RETENTION`

The owner approved this policy during Phase 7.3.6 Stage 3. Approval does not authorize automatic deletion; every deletion remains manifest-verified and owner-authorized.

## Approved generations

- Pre-deployment: retain the latest 3 successful verified generations.
- Daily: retain 7 days.
- Weekly: retain 4 weeks.
- Monthly: retain 6 months.
- Failed or incomplete: remove only after bounded failure evidence is retained.
- Manifest and restore evidence: retain for at least as long as the corresponding backup generation.
- Off-device: required before broad worker rollout.
- Restore rehearsal: at least monthly and before high-risk deployments.

## Controls

- Every generation is immutable and has a unique backup ID and directory.
- Never overwrite, append to or recursively include an older generation.
- Cleanup requires a fresh verified backup, an owner-approved deletion plan and confirmation that no legal, audit or incident hold applies.
- Record counts, generation IDs and dates without publishing private paths, filenames or data.
- Key and recovery custody follows [BACKUP_ENCRYPTION_AND_KEY_CUSTODY.md](./BACKUP_ENCRYPTION_AND_KEY_CUSTODY.md).

## Stage 2 and Stage 3 handling

Stage 2 retained no durable production-data backup because encryption and key custody were not confirmed. Stage 3 uses only synthetic data. The executable-only rollback artifact contains no production data and may be retained while `PRODUCTION_DURABLE_BACKUP_LOCATION_PENDING` remains unresolved.
