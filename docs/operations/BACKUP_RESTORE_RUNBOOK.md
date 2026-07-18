# Backup and restore runbook

## Status

Only the synthetic Stage 1 commands below are enabled. They refuse real database/storage paths and any path outside `.codex-tmp/stage1-backup/`. A copied-real-data rehearsal and production mode require separate approval and implementation.

## Synthetic rehearsal

Run from the repository root:

```powershell
npm.cmd run release-backup:test
npm.cmd run release-backup:synthetic-rehearsal
```

The rehearsal creates a migrated fake WAL database, fake private files, a verified backup, and a separate verified restore. It demonstrates that copying the main database file alone is incomplete while committed data remains in WAL.

The individual synthetic commands require explicit paths:

```powershell
npm.cmd run release-backup:inspect -- --confirm-synthetic --database <stage1-db> --storage-root <stage1-storage>
npm.cmd run release-backup:create -- --confirm-synthetic --source-quiesced --database <stage1-db> --storage-root <stage1-storage> --output <new-stage1-backup-dir>
npm.cmd run release-backup:verify -- --confirm-synthetic --backup <stage1-backup-dir>
npm.cmd run release-backup:restore-test -- --confirm-synthetic --backup <stage1-backup-dir> --target <new-empty-stage1-restore-dir>
```

Outputs are create-only. Existing backup or restore targets are never overwritten. Interrupted copies use temporary sibling directories and remove them on failure.

## Future release backup procedure

This section is the approved design, not an enabled production command.

### Preflight

1. Identify the exact application commit and database engine.
2. Confirm a separate destination with sufficient space and restricted access.
3. Inventory all current durable storage roots against [BACKUP_SCOPE.md](./BACKUP_SCOPE.md). Stop on an unknown root.
4. Confirm no migration, reset, import, retention or repair process is running.
5. Announce downtime and prevent new web/API/native sessions from mutating data.
6. Stop the application and all background writers.
7. Record the start time and operator without recording secrets or private path values in public reports.

### Snapshot

1. With writers stopped, inspect SQLite integrity, foreign keys and migration history.
2. Create a standalone SQLite image through the online backup API. Never copy only `.db`, and never restore `-wal`/`-shm` from an unrelated moment.
3. Copy every `MUST_BACK_UP` root and the initially included image cache while the application remains stopped.
4. Build the manifest using safe relative paths and SHA-256 for every artifact.
5. Verify the backup independently before writers resume.
6. If any source file changes during the window, discard the incomplete generation and restart from preflight.

### Verification

A backup passes only when all are true:

- manifest version and self-check pass;
- database and every private file match size and SHA-256;
- no required or unexpected archive file differs;
- `PRAGMA integrity_check` returns exactly `ok`;
- `PRAGMA foreign_key_check` returns zero rows;
- migration history, required table inventory and recorded counts match;
- the backup opens as a standalone database without source sidecars;
- the source and destination are distinct and the source was not modified.

### Restore rehearsal

1. Restore to a new empty directory on a disposable or copied environment.
2. Verify all hashes and database checks before starting the application.
3. Configure the application explicitly for the restored copy, with integrations disabled.
4. Perform read-only Prisma checks and selected record/count checks.
5. Run the approved copied-database migration rehearsal only in its later authorized stage.
6. Preserve the original backup generation unchanged.

### Retention and overwrite

Every successful generation has a unique immutable directory and backup ID. Never overwrite, merge or append to a verified generation, and never include historical backup directories inside a new source snapshot. A later production policy must define encrypted/offsite copies, minimum generations, maximum age, legal holds and confirmed cleanup. Until that policy exists, Stage 1 performs no backup deletion.

### Windows path cautions

Use explicit quoted paths and allow the tooling to resolve them. Do not hand-concatenate drive-relative paths such as `C:folder`, do not use junctions or symlinks inside source/destination trees, do not rely on case differences to distinguish source and target, and keep relative components within Windows per-segment limits. Long-path support must be verified on the production computer in Stage 2. The Stage 1 test covers backslash input, a long safe relative path and junction escape where the OS permits it.

## Fail-closed behavior

Stop without retrying blindly on corruption, hash mismatch, foreign-key violation, unsupported manifest version, traversal, link/junction, existing output, missing/extra file, source change, or source/destination collision. Use [ROLLBACK_DECISION_TREE.md](./ROLLBACK_DECISION_TREE.md).

## Current limitations

- no real database or real storage was read;
- no copied-real-data rehearsal was run;
- no production restore or rollback was run;
- no encryption/key-custody transport format is implemented;
- no remote/offsite retention policy is approved;
- `storage/uploads/` remains a Stage 2 classification question.
