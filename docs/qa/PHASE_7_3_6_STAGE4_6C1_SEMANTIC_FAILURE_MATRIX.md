# Phase 7.3.6 Stage 4.6C1 Semantic Reconciliation

## Identity and boundary

- Runtime application SHA: `70265f9a1b6e2fb9b702bef88feded586b031bfa`
- Runtime BUILD_ID: `rA_AtO3U0ozcEHqWO5Ic3`
- Pre-repair runtime SHA: `23f892adb971dfd5dc7e775272b51f192b7ac8e6`
- QA matrix commit: `71431106378934ebf192c3cfb9717a9cb31e3908`
- Semantic registry: `stage4.6c1-semantic-v2`
- Synthetic fixtures: `phase-7.3.6-stage4.6c1-semantic-fixtures-v2`
- Capture runner: `stage4.6c1-semantic-first-v2`
- Browser: Chrome `150.0.7871.187`
- Node: `v25.8.1`

No runtime application file was changed by this reconciliation. Changes are
limited to QA contracts, QA capture tooling, synthetic fixture preparation,
tests, package QA scripts, and this documentation.

The failed pre-Stage 4.6C2 attempt remains private and immutable under its old
runtime identity. It is labelled:

```text
HISTORICAL_PRE_STAGE4_6C2_FIRST_SHARD
```

Its 21 masters, five prior semantic passes, sixteen failures, hashes, logs,
traces, and journals were not promoted or overwritten.

## Reconciled failure matrix

Every entry below passed fixture, role, account, start-route, final-route,
visible-state, action, and forbidden-state preflight.

| Scenario | Previous class | Correction | Expected destination and state | Fixture; role; account | Required / forbidden evidence | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `ASSEMBLY_COMPLETED` | `CONTRACT_WRONG` | Replaced the impossible Details-on-Details action with the real completed-item navigation. | Existing item Details route; `ASSEMBLE: COMPLETED`, actor, quantity, history. | `WorkTask=stage4-line-assembly-completed-assemble`; ASSEMBLER; `STAGE-FK-01`. | Require `Scan Next`; forbid enabled `Assembly Completed`. | PASS |
| `ASSEMBLY_PARTIAL` | `FIXTURE_WRONG` | Open the exact projected Order group instead of the source chooser; verify database quantities. | Exact group Details; `IN PROGRESS`, required 2, completed 1, pending 1. | `WorkTask=stage3-order-assembly-progress-assemble`; ASSEMBLER; `STAGE-FK-01`. | Require `Partial Quantity` and `Assembly Completed`; forbid completed state. | PASS |
| `ASSEMBLY_READY` | `FIXTURE_WRONG` | Open the exact projected Order group and assert the real task state. | Exact group Details; `READY`, required 1, completed 0, pending 1. | `WorkTask=stage3-order-assembly-ready-assemble`; ASSEMBLER; `STAGE-FK-01`. | Require `Assembly Completed`; forbid completed state. | PASS |
| `AUTH_EXPIRED` | `CONTRACT_WRONG` | Model requested and final URLs separately and require the expiry query. | `/login?expired=1&next=...`; expiry explanation and login visible. | Active synthetic owner; OWNER start; no selected account after cookie clear. | Require expiry message; forbid dashboard, 404, and protected actions. | PASS |
| `AUTH_FORBIDDEN` | `CONTRACT_WRONG` | Accept the authoritative access-denied redirect. | `/access-denied`; genuine denied page. | Active synthetic picker; PICKER; `STAGE-FK-01`. | Require denied content; forbid owner rows and `Create user`. | PASS |
| `AUTH_INVALID` | `CONTRACT_WRONG` | Use the exact current rejection wording and final URL. | `/login?error=invalid`; authentication remains rejected. | Login route; PUBLIC; no account. | Require `The username or password is incorrect.`; forbid dashboard/session content. | PASS |
| `CONSIGNMENT_INVALID_QUANTITY` | `CONTRACT_WRONG` | Assert stable severity, type, correction guidance, and review navigation rather than an internal token or unrelated page-wide action. | Issues route; ERROR `INVALID QUANTITY`, open blocking correction guidance. | `ConsignmentImportIssue=stage4-consignment-invalid-error`; OWNER; `STAGE-FK-01`. | Require `Back to review`; require safe source correction text. | PASS |
| `CONSIGNMENT_REVIEW` | `APPLICATION_DEFECT` | Stage 4.6C2 now reuses authoritative eligibility and exposes no enabled activation. Contract updated to current server count. | Review route; `REVIEW_REQUIRED`, `Activation blocked`, 4 authoritative blockers. | `ConsignmentBatch=stage3-batch-review_required`; OWNER; `STAGE-FK-01`. | Require `Review blocking issues`; forbid enabled `Activate` and `Activate with warnings`. | PASS |
| `DATA_CONFIRMATION_MISMATCH` | `RUNNER_WRONG` | Open the real image-cache confirmation form, reauthenticate privately, enter a wrong synthetic phrase, and submit safely. | Catalog tab returns with `Type exactly: QUARANTINE stage3-account-fk-01`. | Synthetic preview receipt plus owner credential; OWNER; `STAGE-FK-01`. | Require mismatch error; forbid success. No deletion occurs. | PASS |
| `DATA_DELETE_PREVIEW` | `CONTRACT_WRONG` | Verify the durable preview receipt on Deletion History instead of requiring a nonexistent button. | History tab; `PURGE QA OPERATIONAL DATA`, `PREVIEWED`. | `DataDeletionJob=stage4-delete-preview`; OWNER; `STAGE-FK-01`. | Require preview state; forbid deletion-success claim. | PASS |
| `DATA_EXPIRED_GRANT` | `RUNNER_WRONG` | Reconcile to the real reauthentication preparation surface; no fabricated expired dialog. | Operational tab with the real scoped, single-use owner-password form open. | Synthetic preview receipt; OWNER; `STAGE-FK-01`. | Require owner password, confirmation phrase, action, and Cancel; forbid success. | PASS |
| `DATA_PURGED` | `FIXTURE_WRONG` | Add a deterministic historical purge receipt; perform no live purge. | History tab; `PURGE QUARANTINED FILES`, `PURGED`. | `DataDeletionJob=stage4-delete-purged`; OWNER; `STAGE-FK-01`. | Require durable purged row; forbid Restore control. | PASS |
| `DATA_QUARANTINED` | `FIXTURE_WRONG` | Use a renderable completed quarantine receipt with retained-file metadata. | Trash tab; completed quarantine, one retained file, future deadline. | `DataDeletionJob=stage4-delete-quarantined`; OWNER; `STAGE-FK-01`. | Require Restore; require retained-until state; forbid empty Trash. | PASS |
| `DATA_REPLAY_REJECTED` | `RUNNER_WRONG` | Reconcile this visual state to the required backend permission-denial surface instead of fabricating an unrendered replay receipt. | `/access-denied` after a picker requests Data Management. | Active synthetic picker; PICKER; `STAGE-FK-01`. | Require denied state; forbid Data Management history and destructive controls. | PASS |
| `DATA_RESTORED` | `CONTRACT_WRONG` | Assert the durable current action/state labels instead of brittle prose. | History tab; `RESTORE QUARANTINED FILES`, `COMPLETED`. | `DataDeletionJob=stage4-delete-completed`; OWNER; `STAGE-FK-01`. | Require completed restore receipt; forbid empty history. | PASS |
| `DATA_RETENTION_BLOCKED` | `FIXTURE_WRONG` | Give the retained fixture a future purge deadline and verify the real disabled explanation. | Trash tab; retention deadline visible and purge unavailable. | `DataDeletionJob=stage4-delete-quarantined`; OWNER; `STAGE-FK-01`. | Require disabled reason; forbid enabled permanent purge. | PASS |

## Preflight and targeted browser evidence

The no-screenshot reconciliation preflight produced:

```text
Contracts evaluable:             16/16
Fixture preparation successful: 16/16
Correct role/account:            16/16
Correct final route:             16/16
Unresolved entries:              0
Application defects:             0
```

The affected families then passed at `360x800` and `1440x900`:

```text
Entries:                         32/32
Semantic mismatches:             0
Console errors:                  0
Page errors:                     0
Unexpected failed requests:      0
Horizontal overflow:             0
Undersized operational controls: 0
Login contamination:             0
```

One initial `AUTH_INVALID` pass emitted an isolated generic resource 404 in
Chrome. A focused diagnostic rerun with console source-location recording
passed, followed by a complete clean 32/32 rerun. No console filtering was
added.

## First-shard result

Only `360x800-batch-01` was run. Shards 2–42 were not started.

```text
Planned entries:                 21
Captured entries:                21
Verified entries:                21
Blocked entries:                 0
Semantic mismatches:             0
Browser-error entries:           0
Page-error entries:              0
Unexpected-request entries:      0
Horizontal-overflow entries:     0
Undersized enabled controls:     0
Login-contaminated entries:      0
Missing files:                   0
Hash mismatches:                 0
Dimension mismatches:            0
```

The first attempt with the new runner stopped safely because child processes
could not run Git under the Windows sandbox account. No global Git safe-path
exception was added. The verified parent process now passes the frozen SHA and
branch into capture children, and the bounded shard retry reached 21/21.

## Result

```text
STAGE4_6C1_SEMANTIC_CONTRACTS_AND_FIXTURES_RECONCILED
```
