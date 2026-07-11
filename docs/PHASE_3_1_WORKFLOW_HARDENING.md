# Phase 3.1 Workflow Hardening

## Findings

Phase 3 incorrectly combined `canViewAllWork` with manager controls and backend problem resolution. Idempotency was also checked before authorization and identified requests only by task plus request ID. Completed history had no day boundary, and Work Hub counts were account-wide for ordinary workers.

## Permission Matrix

- `canViewAllWork`: read all applicable selected-account work and problems. It does not grant progress, resolution, assignment, or stage permission.
- `canManageConsignments`: view all selected-account consignment work, resolve problems, and assign or reassign tasks. It does not bypass selected-account access.
- `OWNER`: existing full active-account policy.
- Normal worker: sees unassigned or own stage work and own assigned/reported problems; mutation still requires stage and assignment permission.

The shared helpers are `userCanViewAllConsignmentWork`, `userCanManageConsignmentTasks`, `userCanResolveConsignmentProblems`, and `getWorkTaskCapabilities`.

## Idempotency

Every replay-capable service authorizes the active actor, selected account, task or batch, stage/action permission, and assignment before checking a prior request. `WorkActionLog.requestKind` distinguishes claim, increment, set, complete, problem report/resolution, and assignment families. Replay also verifies actor and expected action type.

The database preserves existing rows, backfills request kinds, and uses a unique task/actor/request-kind/request-ID key plus a task/request-ID lookup index. The latter detects cross-actor and cross-operation collisions. Concurrent progress retries reauthorize, reread the committed log, and return the stored result; unrelated database errors remain errors.

## Queue Semantics

Completed history defaults to `completedAt` on or after the local application-day boundary. Normal-worker hub counts include unassigned or own READY work, only own IN_PROGRESS work, own assigned/reported problems, and work completed by that worker today. Owner, manager, and view-all counts may be account-wide.

## Migration Decision

SQLite uses one additive migration. PostgreSQL creates the enum and column first, then backfills and indexes in a follow-up migration so a newly added enum value is not consumed in the same migration transaction. No task or action history is deleted.

## Test Strategy

Temporary migrated SQLite tests cover view-only denial, manager resolution, assignment denial, actor/action request collisions, concurrent duplicate increments, day filtering, and worker/account-wide count differences. Source-policy checks ensure UI controls consume centralized capabilities. Existing parser, marking, consignment, mobile-source, migration, and build regressions remain mandatory.
