# Real Database Backup And Migration

This workflow preserves the current private SQLite data. Stop the website and all worker/import activity first. Never run `migrate reset`, `db push`, or seed against the real database.

## Prepare And Verify

```powershell
cd E:\marketplace1\marketplace
npm.cmd run real-db:inspect
npm.cmd run real-db:backup
npm.cmd run real-db:test-migrations
npm.cmd run real-db:verify
```

Backups use Node SQLite's consistent backup API and are stored as timestamped files under ignored `backups/database/`. Each private manifest records source/backup sizes, SHA-256 hashes, integrity, commit, and migration state. The disposable migration test copy is always asserted inside `.codex-tmp/`.

The copied database must pass migration deployment, migration status, integrity, foreign keys, preserved table/count/ID bounds, and targeted application suites. `real-db:verify` also proves the real database has not changed since backup.

## Deliberate Real Migration

Only after reviewing the backup path, SHA-256, copied-database result, and count comparison:

```powershell
npm.cmd run real-db:migrate -- --confirm-real-migration
```

The command displays the resolved path and requires typing the database filename. It refuses missing proofs or a changed source hash. Post-migration counts and comparison remain private in `.codex-tmp/`.

## Restore Manually

Stop the server and every writer. Preserve the migrated database rather than overwriting it. Verify the selected backup manifest and SHA-256, then explicitly copy the verified backup to the configured database path using an owner-approved command. Run integrity, foreign-key, migration-status, and startup checks afterward.

Never automate rollback: restoring a stale backup can erase work completed after migration.
