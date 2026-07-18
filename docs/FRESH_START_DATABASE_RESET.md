# Owner-only fresh-start database reset

Phase 7.3.4 does not authorize a real database reset. All migration, repair, import recovery and retention checks must use disposable or copied databases unless separately approved.

## Purpose and safety boundary

This checkpoint removes active marketplace and workflow data while retaining one explicitly selected active OWNER, the SQLite schema, and `_prisma_migrations`. It does not delete or recreate `prisma/dev.db`. Implementation and automated tests operate on disposable copies; the real reset is a separate, guarded owner action.

Stop the Next.js server, imports, workers, and every database writer before backup, reset, or restore. Never use `prisma migrate reset`, `prisma db push`, or seeding against the private database.

## Preserved state

- Exactly the OWNER matched by the exact `--owner-username` argument.
- The owner's ID, username, password hash, name, OWNER role, active state, and `mustChangePassword` state.
- SQLite tables, indexes, constraints, triggers, and applied Prisma migration rows.
- Timestamped database/storage backups and private manifests.
- Source, migrations, documentation, and historical backups.

The reset clears the owner's account selection and assignments, failed-login count, lock, last-login time, IP, and user agent. The password hash is compared byte-for-byte without being printed.

## Deleted state

Every application table discovered from `sqlite_master` is classified at runtime. `User` preserves only the selected owner and `_prisma_migrations` is preserved in full; all other application tables are emptied in foreign-key-safe order. This includes sessions, password resets, other users, accounts and assignments, listings and identifiers, mappings and caches represented in tables, rules, marking records, orders and problems, uploads and previews, import jobs and issues, consignments and files, workflow tasks/actions, scans, and audit logs.

Active files under import jobs, marking library, product-image cache, marking temporary files, consignment imports, uploads, and temporary storage are backed up before a real reset and emptied only after database verification. Backup, private-test-data, source-controlled public assets, source, migrations, and documentation are never cleanup targets.

## Inspect and select the owner

```powershell
npm.cmd run fresh-db:inspect -- --owner-username "YOUR_EXACT_OWNER_USERNAME"
```

Inspection is read-only. It refuses a missing, blank, inactive, non-OWNER, duplicate, or password-hash-less selection. Output contains usernames and roles, not password hashes, sessions, reset tokens, customer rows, or raw private data. Review the machine-derived table inventory, counts, foreign keys, migration rows, integrity, and active-storage totals.

## Create and verify the backup

```powershell
npm.cmd run fresh-db:backup -- --owner-username "YOUR_EXACT_OWNER_USERNAME"
```

The command creates a non-overwriting directory under `backups/fresh-start/<timestamp>/` containing the consistent SQLite backup, manifest, pre-reset counts, reset plan, and storage backup. The manifest records hashes, sizes, integrity, foreign keys, commit, migration rows, selected owner identity, storage totals, and row-count summary. It deliberately excludes the password hash and raw business rows.

## Test the reset on a copy

```powershell
npm.cmd run fresh-db:test-reset -- --owner-username "YOUR_EXACT_OWNER_USERNAME"
```

This copies the verified backup to `.codex-tmp/fresh-start-reset-test.db`, purges only that copy, verifies one owner and zero operational rows, verifies the unchanged password hash and migrations, runs integrity and foreign-key checks, runs `PRAGMA optimize` and `VACUUM`, validates the Prisma schema using the copied database URL, starts a temporary local app, and confirms `/login` responds. Its private proof is `.codex-tmp/fresh-start-reset-test-result.json`. The authentication lookup resolves the owner row without requesting or logging the actual password; real credential login remains a manual post-reset check.

## Explicit real reset

Only after reviewing all three earlier commands, with writers stopped:

```powershell
npm.cmd run fresh-db:reset -- --confirm-fresh-start --owner-username "YOUR_EXACT_OWNER_USERNAME"
```

The command refuses unless the manifest and backup hash verify, disposable proof passes, the real database hash still equals the pre-backup source hash, the owner and migrations still match, and the exact flag is present. It then requires three typed values:

```text
dev.db
YOUR_EXACT_OWNER_USERNAME
DELETE ALL DATA EXCEPT THIS OWNER
```

A Y/N response is insufficient. After the transaction it checks counts, owner identity, password-hash equality, migrations, integrity, and foreign keys; optimizes and vacuums only after successful checks; writes the private post-reset report; and clears backed-up active storage.

## Post-reset owner review

Run `npm.cmd run real-review:start`. Manually confirm the existing password signs in, the dashboard opens, Users contains one owner, and Accounts, Product Inventory, Orders, Consignments, Work Hub, Problems, Imports, Marking Library, Default Processing, and reports show valid zero-data states. Confirm System does not crash and no stale file link remains. Do not seed or create real data automatically.

## Restore warning and procedure

Restore replaces newer data. Stop all writers, identify the exact private manifest, and run:

```powershell
npm.cmd run fresh-db:restore -- --backup-manifest "backups/fresh-start/TIMESTAMP/backup-manifest.json"
```

Type `RESTORE dev.db FROM VERIFIED BACKUP`. The helper verifies the manifest SHA-256, makes a pre-restore safety copy beside the selected backup, restores the database, and checks integrity and foreign keys. It never silently rolls back. Storage restoration is intentionally manual so the owner can decide whether replacing newer files is appropriate; restore matching `storage-backup` contents only while writers remain stopped.

After verification, create/import new seller accounts and catalog data from the beginning. Product Inventory remains a marketplace catalog, not warehouse stock or an ERP ledger.
