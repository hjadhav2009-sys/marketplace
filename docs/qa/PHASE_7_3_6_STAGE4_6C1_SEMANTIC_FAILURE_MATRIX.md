# Phase 7.3.6 Stage 4.6C1 Semantic Failure Matrix

## Boundary and preserved evidence

- Frozen application SHA: `23f892adb971dfd5dc7e775272b51f192b7ac8e6`
- Frozen application BUILD_ID: `_xxSHU7SmF6Uo-IkJ0hGf`
- Failed shard: `360x800-batch-01`
- Historical label: `HISTORICAL_FAILED_SEMANTIC_ATTEMPT`
- Captured full-page masters: 21
- Semantically verified entries: 5
- Failed semantic entries reviewed here: 16
- Browser console errors: 0
- Page errors: 0
- Horizontal overflow entries: 0
- Undersized enabled-control entries: 0

All referenced screenshots, hashes, traces, browser logs, journals, and progress
records remain private and untracked under:

```text
.codex-tmp/ui-state-atlas/current/23f892adb971dfd5dc7e775272b51f192b7ac8e6/
```

The review did not access production data. It inspected only the private
synthetic staging database and synthetic browser evidence.

## Classification rules

Each entry has exactly one primary classification:

- `CONTRACT_WRONG`
- `FIXTURE_WRONG`
- `RUNNER_WRONG`
- `APPLICATION_DEFECT`
- `UNRESOLVED`

An application defect is recorded only where the synthetic fixture already
proves the required state and the authoritative backend requirement confirms
the expected behavior.

## Failure matrix

| Scenario | Start → actual final URL | Actual state and actions | Previous expectation | Fixture, role, account | Screenshot | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| `ASSEMBLY_COMPLETED` | `/work/consignments/items/stage4-line-assembly-completed-assemble` → same | Item details show `ASSEMBLE: COMPLETED`, completed actor, quantity and history. Actions are `Scan Next` and `Back to Work`. | Required a `Details` action while already on Details. | `WorkTask.id=stage4-line-assembly-completed-assemble`; ASSEMBLER; `STAGE-FK-01` | `ASSEMBLY_COMPLETED__work-consignments-items-stage4-line-assembly-completed-assemble__360x800__FULL-PAGE@2x.png` | `CONTRACT_WRONG` |
| `ASSEMBLY_PARTIAL` | `/work/assemble` → same | Source chooser shows four Order cards and two Consignment cards. No specific partial card was opened. | Required `IN PROGRESS` and `Save Partial Quantity` on the source chooser. | `WorkTask.id=stage3-order-assembly-progress-assemble`; ASSEMBLER; `STAGE-FK-01` | `ASSEMBLY_PARTIAL__work-assemble__360x800__FULL-PAGE@2x.png` | `FIXTURE_WRONG` |
| `ASSEMBLY_READY` | `/work/assemble` → same | Source chooser is visible; no specific READY card was opened. | Required READY state and `Assembly Completed` immediately on the source chooser. | `WorkTask.id=stage3-order-assembly-ready-assemble`; ASSEMBLER; `STAGE-FK-01` | `ASSEMBLY_READY__work-assemble__360x800__FULL-PAGE@2x.png` | `FIXTURE_WRONG` |
| `AUTH_EXPIRED` | `/dashboard` → `/login?expired=1&next=%2Fdashboard` | Login page shows “Your session expired. Sign in again to continue.” Protected dashboard content is absent. | Expected the browser to remain on `/dashboard`. | `User.id=stage3-owner`; OWNER; selected account cleared by session expiry | `AUTH_EXPIRED__dashboard__360x800__FULL-PAGE@2x.png` | `CONTRACT_WRONG` |
| `AUTH_FORBIDDEN` | `/owner/users` → `/access-denied` | Genuine Access Denied page is visible. Protected user rows and user-creation controls are absent. | Expected the final URL to remain `/owner/users`. | `User.id=stage3-picker-a`; PICKER; `STAGE-FK-01` | `AUTH_FORBIDDEN__owner-users__360x800__FULL-PAGE@2x.png` | `CONTRACT_WRONG` |
| `AUTH_INVALID` | `/login` → `/login?error=invalid` | Login remains rejected and shows “The username or password is incorrect.” No protected content or session is present. | Required the different sentence “Invalid username or password”. | `route:/login`; PUBLIC; no selected account | `AUTH_INVALID__login__360x800__FULL-PAGE@2x.png` | `CONTRACT_WRONG` |
| `CONSIGNMENT_INVALID_QUANTITY` | `/owner/consignments/stage3-batch-review_required/issues` → same | Issues page shows ERROR severity, `INVALID QUANTITY`, the blocking explanation, and no manual resolution action for the error. | Required the internal underscore token `INVALID_QUANTITY`. | `ConsignmentImportIssue.id=stage4-consignment-invalid-error`; OWNER; `STAGE-FK-01` | `CONSIGNMENT_INVALID_QUANTITY__owner-consignments-stage3-batch-review_required-issues__360x800__FULL-PAGE@2x.png` | `CONTRACT_WRONG` |
| `CONSIGNMENT_REVIEW` | `/owner/consignments/stage3-batch-review_required/review` → same | Page shows `REVIEW REQUIRED`, two blocking errors, an unresolved missing listing, and an enabled `Activate with warnings` button. | A blocking review state must keep activation unavailable until source/listing errors are corrected. | `ConsignmentBatch.id=stage3-batch-review_required`; OWNER; `STAGE-FK-01` | `CONSIGNMENT_REVIEW__owner-consignments-stage3-batch-review_required-review__360x800__FULL-PAGE@2x.png` | `APPLICATION_DEFECT` |
| `DATA_CONFIRMATION_MISMATCH` | `/owner/data-management?tab=operational` → same | Real purge form is expanded, but no mismatch was entered or submitted. | Required a rejected typed-confirmation state. | `DataDeletionJob.id=stage4-delete-preview`; OWNER; `STAGE-FK-01` | `DATA_CONFIRMATION_MISMATCH__owner-data-management-tab-operational__360x800__FULL-PAGE@2x.png` | `RUNNER_WRONG` |
| `DATA_DELETE_PREVIEW` | `/owner/data-management?tab=operational` → same | Operational purge form is expanded. There is no standalone `Preview` control on this page. A durable PREVIEWED receipt exists in synthetic history. | Required a non-existent `Preview` action on the operational tab. | `DataDeletionJob.id=stage4-delete-preview`; OWNER; `STAGE-FK-01` | `DATA_DELETE_PREVIEW__owner-data-management-tab-operational__360x800__FULL-PAGE@2x.png` | `CONTRACT_WRONG` |
| `DATA_EXPIRED_GRANT` | `/owner/data-management?tab=operational` → same | Fresh owner-authentication form is visible; no expired one-use grant was prepared or consumed. | Required an expired-authorization rejection and reauthentication state. | `DataDeletionJob.id=stage4-delete-preview`; OWNER; `STAGE-FK-01` | `DATA_EXPIRED_GRANT__owner-data-management-tab-operational__360x800__FULL-PAGE@2x.png` | `RUNNER_WRONG` |
| `DATA_PURGED` | `/owner/data-management?tab=history` → same | History shows a PREVIEWED QA purge and completed restore; it contains no completed permanent-purge receipt. | Required a durable purged state with no restore action. | `DataDeletionJob.id=stage4-delete-completed`; OWNER; `STAGE-FK-01` | `DATA_PURGED__owner-data-management-tab-history__360x800__FULL-PAGE@2x.png` | `FIXTURE_WRONG` |
| `DATA_QUARANTINED` | `/owner/data-management?tab=trash` → same | Trash renders no item because the synthetic row uses state `QUARANTINED`, while the page lists retained jobs in `COMPLETED` or `FAILED_RESTORED` states. | Required a retained quarantine item and Restore action. | `DataDeletionJob.id=stage4-delete-quarantined`; OWNER; `STAGE-FK-01` | `DATA_QUARANTINED__owner-data-management-tab-trash__360x800__FULL-PAGE@2x.png` | `FIXTURE_WRONG` |
| `DATA_REPLAY_REJECTED` | `/owner/data-management?tab=history` → same | History contains no replay-conflict result because no duplicate request with changed scope was attempted. | Required a controlled replay rejection. | `DataDeletionJob.id=stage4-delete-completed`; OWNER; `STAGE-FK-01` | `DATA_REPLAY_REJECTED__owner-data-management-tab-history__360x800__FULL-PAGE@2x.png` | `RUNNER_WRONG` |
| `DATA_RESTORED` | `/owner/data-management?tab=history` → same | History shows `RESTORE QUARANTINED FILES` with state `COMPLETED`. | Required the brittle word `restored`, which the current durable receipt does not render. | `DataDeletionJob.id=stage4-delete-completed`; OWNER; `STAGE-FK-01` | `DATA_RESTORED__owner-data-management-tab-history__360x800__FULL-PAGE@2x.png` | `CONTRACT_WRONG` |
| `DATA_RETENTION_BLOCKED` | `/owner/data-management?tab=trash` → same | Retained item is absent because the synthetic quarantine state is not one rendered by the Trash filter. | Required a retained item with permanent purge unavailable before its deadline. | `DataDeletionJob.id=stage4-delete-quarantined`; OWNER; `STAGE-FK-01` | `DATA_RETENTION_BLOCKED__owner-data-management-tab-trash__360x800__FULL-PAGE@2x.png` | `FIXTURE_WRONG` |

## Confirmed application defect

`CONSIGNMENT_REVIEW` is not a wording-only failure.

The synthetic batch contains unresolved `ERROR` issues, including an invalid
source quantity and a missing listing. The review page reports:

```text
Blocking errors 2
REVIEW REQUIRED
```

but also exposes an enabled:

```text
Activate with warnings
```

The authoritative activation validator correctly treats unresolved ERROR
issues as blocking and returns:

```text
A source import error has no valid work line. Correct or replace the source
and reparse before activation.
```

Therefore backend mutation safety remains intact, but the UI contradicts the
state and invites an action that cannot succeed. The button must be absent or
disabled with the blocking reason when activation validation reports problems.

Per the Stage 4.6C1 application-defect rule, no runtime repair is made in this
QA-only checkpoint and the first shard is not promoted or rerun.

## Result

```text
STAGE4_6C1_BLOCKED_APPLICATION_DEFECT
```
