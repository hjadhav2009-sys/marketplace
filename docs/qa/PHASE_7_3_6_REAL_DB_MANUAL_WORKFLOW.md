# Phase 7.3.6 Guarded Real-Database Manual Workflow

## Current gate

Real-database manual QA is not authorized by implementation completion alone. Stop after copied-data rehearsal until the owner types exactly:

```text
APPROVE REAL DATABASE MANUAL QA AFTER VERIFIED BACKUP
```

That phrase authorizes manual QA only. It does not authorize merge, deployment, a production reset, or bulk deletion.

## Before authorization

1. Finish automated and visible browser QA with synthetic data.
2. Exercise all four routes for Customer Orders and Consignments:
   - Pick → Pack
   - Pick → Mark → Pack
   - Pick → Assembly → Pack
   - Pick → Mark → Assembly → Pack
3. Stop server, runners, imports, and other database writers.
4. Record real database and managed-storage hashes/counts.
5. Create a fresh sidecar-aware database and managed-storage backup.
6. Verify the backup manifest.
7. Restore into a new private copy.
8. Apply the final migration set only to that copy.
9. Run integrity, foreign-key, row-count, storage-manifest, and application smoke checks.
10. Re-hash the real source and prove it did not change.

An older copied-data rehearsal does not satisfy this fresh backup gate.

## Authorized manual session

- Bind only to the reviewed local/private address.
- The owner enters credentials in the visible browser.
- Do not automate, read, capture, store, or print the owner password.
- Start with read-only navigation and account selection.
- Perform only bounded, explicitly recorded QA mutations.
- Capture sanitized evidence with no customer names, addresses, tokens, cookies, raw source rows, or private paths.
- Recheck database/storage hashes and operational counts after the session.

## Stop conditions

Stop immediately on any:

- source database or production storage change outside the authorized QA scope;
- migration mismatch or foreign-key failure;
- account-scope authorization failure;
- duplicate action, duplicate task, or unsafe Pack completion;
- unexplained 4xx/5xx, raw database error, or browser exception;
- backup/restore hash mismatch;
- ambiguous destructive-action preview.

## After QA

Stop all review processes. Preserve generalized evidence and private manifests in their approved locations. Do not merge, push an operational branch, deploy, or begin Expo work without a separate decision.
