# Phase 3: Consignment Worker Workflow Plan

## Current architecture

Phase 2 stores account-scoped Flipkart consignment batches, lines, supporting files, issues, immutable activation snapshots, and dormant stage plans. Activation creates READY/LOCKED WorkTask rows transactionally without modifying customer Order statuses.

## Worker routes

- /work: permission-aware Work Hub.
- /work/consignments/pick: active consignment PICK queue and exact scanner/manual lookup.
- /work/marking: active MARK queue, marking settings, preview and private file access.
- /work/consignments/pack: active PACK queue and exact lookup.
- /work/problems: task-level problem queue and manager resolution.
- /work/tasks/[taskId]/marking-file: authenticated task-scoped stream.

## Authorization

Every mutation re-reads the active user, selected account, assigned active accounts, stage permission, task account, line account, and assignment. OWNER has active-account bypass. Form account IDs are selectors only. Viewing all work does not by itself grant stage mutation.

## Assignment

Unassigned READY work is visible to permitted workers. The first mutation atomically claims it. Assigned work is mutable only by the assignee or OWNER. Managers may assign, reassign, or unassign only to active account-assigned users with the required stage permission. The next stage is unlocked unassigned.

## Progress transactions

Progress accepts whole nondecreasing quantities, expected current quantity, and optional clientRequestId. A unique task/request log makes retries idempotent. Guarded updates reject stale pages, LOCKED/PROBLEM/CANCELLED work, over-completion, and simultaneous conflicting claims. Scan/search alone never mutates.

## Completion

Completing one stage unlocks exactly the next sequence. Final PACK completion timestamps the line. Central reconciliation keeps a progressing batch ACTIVE, sets PROBLEM while any task is problematic, restores ACTIVE after resolution, and marks COMPLETED only when all final PACK tasks complete.

## Marking file access

A marker with selected-account and assignment access may stream only the active MARKING_FILE linked to that MARK task. Node streams are converted with Readable.toWeb, responses are private/no-store/nosniff, paths are never disclosed, and every download is recorded in WorkActionLog.

## Problems

Reporting preserves quantity and assignment, records category/note/actor/time, blocks later work, and moves batch reconciliation to PROBLEM. Manager resolution preserves history and returns zero-progress work to READY or partial work to IN_PROGRESS.

## Performance

Queues use indexed account/source/stage/status/assignment filters, compact includes, cursor-like pagination at 50, lazy images, and separate counts. Activation precomputes snapshots and uses chunked createMany plus batched raw snapshot updates while retaining one atomic transaction. Benchmarks cover 100, 1,000, and 10,000 lines.

Local temporary-SQLite benchmark (`npm.cmd run workflow:benchmark`): 100 lines / 200 tasks in 186 ms; 1,000 lines / 2,000 tasks in 1,155 ms; 10,000 lines / 20,000 tasks in 11,099 ms. Timings vary by machine, but every run verifies the exact persisted task count.

## UI

Worker cards prioritize image, SKU, required/completed/remaining quantity, assignment, and one obvious action. Mobile uses Work/Pick/Pack/Problems/Account navigation, 44px controls, no mandatory tables, and content padding above the bottom bar.

## Non-goals

No inventory, receiving, QC, stock accounting, customer-order Assembly, universal cross-account scanner, automatic marking-agent deletion, mobile API changes, or APK work.

## Tests

Temporary migrated SQLite tests cover authorization, claiming races, idempotent progress, stage unlocking, completion, problems, exact search, streamed marking files, assignment rules, migration constraints, activation scale, and all existing Order/Meesho/Flipkart regressions.
