# Phase 7.3.6 RC1 staging and production handoff

Status: **PREPARED WITH A BACKUP/RESTORE BLOCKER - NOT EXECUTED**

This runbook is for a later, separately authorized rollout session. RC1 validation does not authorize a real-database command, deployment, production login, or worker action. Keep the application, import runners, scheduled jobs, and every other database writer stopped throughout backup, rehearsal, migration, and rollback.

Production staging, migration, and rollback are currently **BLOCKED** because the repository does not yet provide one reviewed procedure that proves all SQLite writers are stopped, handles the main database together with any `-wal`, `-shm`, or journal sidecars, and backs up/restores matching private storage. Do not substitute raw file-copy commands.

## 1. Release identity and change control

Before any data operation, record the approved source commit, PR merge-test commit, operator, date, database engine, database filename, and maintenance window. The approved commit must be unchanged and all required GitHub checks must belong to it. Do not use this SQLite procedure for a PostgreSQL production target.

```powershell
cd <repository-root>
git status --short --branch
git rev-parse HEAD
git diff --check
npm.cmd run check:production-readiness
```

Stop if the worktree is not the approved tree, a private/generated file is staged, a check belongs to an older commit, or the production target is ambiguous.

## 2. Backup and copied-database rehearsal

The following repository commands are the existing database-only inspection, backup, copied-migration, and unchanged-source sequence. They were not executed in this RC1 validation and are insufficient for SQLite sidecars plus matching private storage. In a separately authorized rehearsal, they are intended to resolve the configured database, inspect it read-only, create a consistent SQLite database backup, migrate a disposable copy, run the copied-database application suites, and prove that the source hash has not changed.

```powershell
cd <repository-root>
npm.cmd run real-db:inspect
npm.cmd run real-db:backup
npm.cmd run real-db:test-migrations
npm.cmd run real-db:verify
```

Record only sanitized evidence: source/backup byte sizes, SHA-256 equality result, integrity result, foreign-key violation count, applied/pending migration counts, table row-count deltas, and the copied-database test result. Keep the private paths, manifests, database copies, and row contents out of Git and tickets.

These commands do **not** constitute a complete production backup/restore plan for private storage or SQLite sidecars. Before any production migration, add and independently review an exact process-stopped backup/restore procedure that inventories, hashes, and preserves the matching private-storage tree and handles SQLite sidecars safely. Until that procedure and a disposable restore rehearsal pass, stop at this section.

Required rehearsal result:

- source and verified backup hashes match their manifest;
- `PRAGMA integrity_check` is `ok` before and after;
- foreign-key violations are zero before and after;
- pending migrations are zero on the migrated copy;
- additive migrations preserve existing row counts and stable identifiers;
- all copied-database application suites pass;
- the real database hash remains exactly unchanged.
- the separately reviewed database-plus-private-storage restore rehearsal passes without stale sidecars or unmatched files.

Any mismatch is a stop condition. Do not “repair” the real database during the rehearsal.

## 3. Explicit migration - blocked pending backup/restore approval

The migration command below is recorded for operator review only. Do not run it until the copied rehearsal, maintenance-window approval, fresh successful `real-db:verify`, and the missing sidecar-aware database-plus-private-storage backup/restore gate all pass.

```powershell
cd <repository-root>
npm.cmd run real-db:migrate -- --confirm-real-migration
```

The command requires the exact database filename to be typed. It refuses stale backup/test evidence or a source hash that changed after backup. Do not replace this with `prisma migrate reset`, `prisma db push`, or an ad-hoc migration command.

Immediately after migration, record:

- integrity and foreign-key results;
- pending migration count;
- before/after counts and grouped status totals;
- selected stable ID bounds and package/task relationships;
- application startup/preflight result.

If any check fails, keep all writers stopped and enter the rollback decision process.

## 4. Rollback conditions and blocked procedure

Rollback is required when migration exits nonzero, integrity or foreign-key checks fail, an expected table/count relationship is lost, startup cannot read the migrated schema, authorization scope is wrong, work is missing/duplicated, or a Pack/workflow invariant fails. A UI-only issue may be handled by reverting application code only when schema/data checks are clean and the release owner explicitly approves that path.

There is intentionally no automatic real-database rollback. The earlier raw `Copy-Item` example has been removed: replacing only the main SQLite file can leave stale sidecars, and copying only that file does not preserve a complete failed state for investigation. No production restore command is approved in this RC.

Keep all writers stopped and preserve the host for incident review. A future reviewed restore tool/procedure must, before it is accepted:

- prove the application, import runners, scheduled jobs, and other SQLite writers are stopped and no database handle remains open;
- identify and safely handle the main database plus `-wal`, `-shm`, and journal sidecars;
- verify the selected database backup and matching private-storage inventory/hashes;
- make a complete non-overwriting forensic copy of the failed database state and relevant sidecars;
- restore the database and private storage as one explicitly approved recovery set;
- verify `integrity_check = ok`, zero foreign-key violations, migration state, expected pre-release counts/identifiers, and startup before reopening access;
- be rehearsed against a disposable copy before it is permitted on the real target.

Until that procedure exists and passes review/rehearsal, the only approved response to a rollback condition is to keep access closed, preserve evidence, and escalate. Do not improvise file operations.

## 5. Production environment checklist

- Approved immutable commit and successful checks recorded.
- Correct database engine/schema selected; PostgreSQL runtime validation completed if PostgreSQL is the target.
- Writers stopped; maintenance page or access control active.
- Reviewed, rehearsed, sidecar-aware database and matching private-storage backup/restore procedure available on a separate protected volume. **Currently blocked.**
- Production secrets supplied outside Git; cookie security, trusted proxy, origin, and public URL settings verified.
- Outbound email/marketplace behavior reviewed; no synthetic credentials remain.
- Disk capacity, backup capacity, clock, TLS, service account permissions, and log rotation verified.
- No `.codex-tmp`, QA database, synthetic users, screenshots, APK/AAB, or development server is part of the release.
- Rollback owner, decision deadline, and communication channel assigned.

## 6. Post-deployment smoke checklist

Use sanitized records and the smallest controlled scope. Verify login/logout, selected-account authorization, owner/worker permission separation, Product Inventory, one safe import status read, Work Hub counts/source separation, scanner lookup without mutation, and one controlled task through its intended route. Confirm Pack remains blocked until immutable prerequisites complete and the final authoritative Pack action reconciles the source exactly once.

Also confirm:

- no unexplained 4xx/5xx, hydration error, raw database error, or repeated polling storm;
- no private row or path in logs/errors;
- projection and live-event counts move once;
- no duplicate Order, WorkTask, receipt, action log, identifier, or listing;
- backup and rollback material remain available.

## 7. Two-worker pilot

Start with two trained synthetic/pilot workers and one small controlled batch. Test simultaneous queue reads, a same-card claim, duplicate click/retry, assignment change, permission removal, stage problem/resolution, and all approved Order/Consignment routes. Reconcile source quantity, task quantity, projection membership, receipt, action log, and live event after every action.

Expand beyond the pilot only when:

- every browser width and two-worker scenario in the RC1 QA package has passed;
- no Blocker/High issue remains;
- copied-database rehearsal and production-computer performance checks pass;
- the sidecar-aware database-plus-private-storage backup/restore rehearsal passes;
- first pilot batch reconciles with zero duplicate/lost work;
- support and rollback owners explicitly sign off.

## 8. Incident stop criteria and first-shift observation

Stop new work immediately for any cross-account access, missing/duplicated work, wrong quantity, prerequisite bypass, wrong-stage rewind, identifier reassignment, stuck import lease, projection divergence, unexplained database error, integrity/foreign-key failure, or private-data exposure. Do not improvise data edits.

During the first shift, monitor request error rate/latency, import lease and retry counts, jobs stuck RUNNING, projection DIRTY/FAILED state, live-event backlog, duplicate receipt conflicts, problem/recovery volume, disk/database growth, backup health, and worker-reported stale cards. Compare task/source/projection totals at agreed checkpoints.

Native React Native/Expo work remains outside this release. It may begin only after browser/backend behavior is accepted, the backend/API contract is documented and frozen, staging/pilot workflows are proven, and WebView remains excluded.
