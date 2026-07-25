# Owner Data Management

`/owner/data-management` is an OWNER-only control surface for bounded data cleanup. Worker roles cannot preview or execute its operations, and its service rechecks the active user instead of trusting page authorization.

## Safety sequence

Every destructive operation follows this sequence:

1. Load an account-scoped dry-run preview and blockers.
2. Re-enter the current owner password.
3. Apply durable username/session throttling.
4. Issue a random, action-and-scope-bound authorization that expires after five minutes.
5. Require the exact displayed confirmation phrase.
6. Create a durable deletion-job receipt.
7. Move managed files into private quarantine.
8. Update database metadata transactionally.
9. Verify the resulting state.
10. Retain the quarantine for restore until its purge date.

The authorization is one-use. A repeated network request with the same client request ID returns the stored result; changing the payload under that request ID is rejected.

Passwords, tokens, absolute paths, source rows, and customer data are not written to deletion history or audit metadata.

## Supported scopes

- Uploaded source file only: removes a retained managed file without deleting its import counters/history.
- Import job archive: archives a completed job and quarantines its retained artifact.
- Generated reports: quarantines retained report files separately.
- Product image cache: quarantines regenerable cached files without deleting marketplace image URLs.
- QA operational data: deletes operational records only for an account whose code begins `QA-` or `STAGE-`; Product Inventory and access remain.
- Product Inventory: archive a referenced listing, or delete only an unreferenced listing.
- Trash / Quarantine: restore retained files or permanently purge them after the retention deadline.

Current source files for actionable Consignments and active/review-required import jobs fail closed.

## Deliberate exclusions

- Full database reset is CLI-only and is never executed by the web page.
- Seller-account deletion continues through the existing Account lifecycle service.
- Normal worker action history has no broad delete button.
- Production deployment, migration, backup deletion, and private-storage replacement are not available here.

## Failure recovery

Deletion jobs use durable states including `AUTHORIZED`, `QUARANTINING_FILES`, `FILES_QUARANTINED`, `DELETING_DATABASE_ROWS`, `VERIFYING`, and terminal outcomes. A retry of an interrupted request can resume after files were quarantined. If the database phase fails before commit, moved files are restored and the job records `FAILED_RESTORED`. A verification failure leaves the quarantined data intact for owner review.
