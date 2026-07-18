# Phase 7.3.6 Stage 2 copied-data rehearsal

## Decision

`STAGE2_COPIED_BACKUP_RESTORE_MIGRATION_PASSED`

This decision approves only preparation for the separately controlled Stage 3 staging gate. It is not permission to migrate production, deploy, merge, push, begin browser/two-worker QA, or begin native work.

## Starting point and safety boundary

- Stage 1 base: `phase-7.3.6-stage1-backup-restore` at `1f7877cfd8ae5633e30406d5c5500425df6686b4`.
- Local Stage 2 branch: `phase-7.3.6-stage2-copied-data-rehearsal`.
- Production SQLite and reviewed storage were read/copied only after writer checks.
- No source migration, checkpoint, vacuum, reset, seed, rename, delete, ACL change or replacement occurred.
- Absolute paths, real filenames, source hashes and relational digests exist only in ignored private reports.

## Quiescence and scope

No other Node application process was detected, configured application ports were closed, and no active import lease existed. One legacy `RUNNING` ImportJob row had no lease columns in the old schema; with no writer process it was recorded as stale operational state, not treated as an active writer.

Five roots were included:

- retained import-job artifacts: `MUST_BACK_UP`;
- marking library: `MUST_BACK_UP`;
- retained consignment imports: `MUST_BACK_UP`;
- product-image cache: `REGENERABLE_INCLUDED`;
- historical uploads root: `MUST_BACK_UP_PENDING_CLEANUP`.

The uploads root had no files during the rehearsal and no current source-code writer was found. It remains conservatively included because historical reset tooling still identifies it as active; Stage 3 may remove that classification only through an explicit cleanup decision.

## Capacity and privacy

The source database was approximately 221.7 MB and included storage approximately 78.0 MB across 20 files. The calculated three-copy-plus-25% budget was approximately 1.12 GB; approximately 41.8 GB was free. The largest included file was approximately 22.7 MB and the longest relative path was 95 characters.

The private run directory was ignored by Git and restricted to the current execution identity and `SYSTEM`; no broad group remained. Windows volume protection could not be confirmed, so encryption/key custody remains `ENCRYPTION_OWNER_DECISION_PENDING`. The verified backup and restored copies were deleted after testing and were not retained as a production backup.

## Backup and restore evidence

The selected method was `QUIESCED_SIDECAR_COPY_THEN_NODE_SQLITE_ONLINE_BACKUP`:

1. hash the quiesced main file and present sidecars;
2. copy that file set into ACL-restricted private staging;
3. prove the source set is unchanged;
4. use the SQLite online backup API against private staging;
5. copy all included storage roots;
6. seal and verify `ReleaseBackupManifestV1`;
7. re-fingerprint the production source.

This avoids SQLite shared-memory coordination changes on the production source while still producing a standalone online-backup image. Database/storage hashes, canonical manifest check, exact pre-migration table counts and migration history passed. Both independent restores passed SQLite integrity with zero foreign-key violations.

## Copied migration result

The copied database began with 22 applied and 9 pending migrations. `prisma migrate status`, `prisma migrate deploy`, and the final status ran only with a process-local copied `DATABASE_URL`. It ended with 31 applied and zero pending migrations.

Across 27 pre-existing tables there were zero decreases and zero unexplained increases. Bounded primary-key samples covering 110 rows across nine relational tables remained present. The migration created/backfilled newer workflow structures as designed; whole derived-group equality was therefore not used as a false invariant.

## Application and rollback smoke

The migrated copy passed readiness and a localhost-only Next.js smoke on an alternate port. Login, Product Inventory, Imports, Consignments and Work Hub returned successful responses with a temporary copied-database session. Import, marking, consignment and product-image storage all pointed to restored private roots. No production tunnel or production cookie was used.

The rollback recovery rehearsal restored the immutable backup into a new target, reapplied the reviewed migrations required by the current executable, switched only a disposable pointer and repeated the localhost smoke. This proves recover-to-current-release behavior. A true rollback to an older executable still requires retaining and testing that executable artifact in Stage 3.

## Timings

Observed on this computer:

| Operation | Time |
| --- | ---: |
| Scope inventory | 1.0 s |
| Database/storage backup | 35.9 s |
| Backup verification | 7.8 s |
| Pre-migration restore | 11.5 s |
| Migration restore | 11.3 s |
| Nine migrations | 29.5 s |
| Current-copy startup and smoke | 27.4 s |
| Rollback-copy preparation | 11.6 s |
| Rollback-copy migrations | 29.3 s |
| Rollback startup and smoke | 26.7 s |
| Total rehearsal | 226.9 s |

These are rehearsal observations, not a guaranteed production RTO.

## Cleanup and remaining gates

All restored databases, copied storage, ephemeral sessions, temporary server state and the durable copied backup were deleted. Deletion is logical deletion, not claimed secure erasure. The original database and included storage matched their private before/after aggregate fingerprints.

Focused validation passed: Prisma validation, TypeScript, ESLint with zero warnings, the 32-case Stage 1 backup test, all 25 required copied-mode scenarios with 26 fail-closed outcomes, security tests, production-audit hardening and authoritative-write-path policy, and the complete validator suite. The production build passed with 78 routes because application storage-root isolation controls changed. `npm audit --omit=dev` reported zero vulnerabilities.

Remaining Stage 3 prerequisites include owner approval for encryption/key custody and retention, a retained previous-executable rollback artifact, a controlled staging plan, final writer-stop ownership, and later browser/two-worker QA. Production migration and deployment remain unapproved.
