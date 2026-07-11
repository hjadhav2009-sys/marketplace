# Cross-account Work Authorization

`getAuthorizedWorkAccounts()` is the central scanner account boundary.

- Owner: all active seller accounts.
- Worker: active explicitly assigned accounts plus the active legacy primary account.
- Inactive, unassigned, or removed accounts: unavailable immediately.
- Account filter: rejected when outside the authorized set; there is no fallback.

Resolver queries include account predicates for orders, listing identifiers, tasks, lines, and batches. Candidate actions recalculate the same account set and reload the source under the supplied account before checking role, stage permission, assignment, and expected state. A cached card cannot preserve access after assignment removal.

Cross-account actions do not switch or rewrite the selected-account cookie. Candidate responses contain operational display data only and exclude passwords, sessions, database configuration, private file paths, and raw import/listing rows.

Problem candidates follow central visibility rules. Mutation controls remain limited to users with the applicable work-stage or management permission.
