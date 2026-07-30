# Phase 7.3.6 Stage 4.6C3C — Batch 02 Failure Matrix

## Scope and immutable identities

- Checkpoint: Stage 4.6C3C — Batch 02 Semantic-State and Touch-Target Reconciliation
- Branch: `phase-7.3.6-stage4.6c-atlas-recovery`
- Frozen runtime SHA: `70265f9a1b6e2fb9b702bef88feded586b031bfa`
- Frozen runtime BUILD_ID: `rA_AtO3U0ozcEHqWO5Ic3`
- Frozen runtime tag: `phase-7.3.6-stage4.6c2-frozen-rc`
- QA runner SHA: `70dd48e8cf54760e99c242ef254687065f2dc57d`
- Viewport: `360×800`
- Batch 01: 21/21 verified and unchanged
- Batch 02: 6/20 verified; 14 failures classified below
- Browser console errors: 0
- Page errors: 0
- Unexpected network failures: 0
- Horizontal overflow: 0
- Build-identity failures: 0

The initial failed attempt remains privately preserved as
`HISTORICAL_360X800_BATCH02_INITIAL_FAILURE`. Failed entries were not promoted
to verified evidence. A full-page master exists for `PACK_ASSEMBLY_LOCKED`;
other failures retain their planned evidence path, trace, DOM inspection,
semantic result, and journal record, but capture stopped before a new master
was written.

## Classification summary

| Classification | Count | Scenarios |
| --- | ---: | --- |
| `CONTRACT_WRONG` | 6 | `IMPORT_CANCELLED`, `IMPORT_COMPLETED`, `IMPORT_MULTI_FILE`, `IMPORT_ONE_FILE`, `IMPORT_UPLOAD_EMPTY`, `MARK_COMPLETED` |
| `FIXTURE_WRONG` | 1 | `IMPORT_VALIDATION_ERROR` |
| `RUNNER_WRONG` | 5 | `DATA_WRONG_PASSWORD`, `IMPORT_AMAZON_THREE_ROLE`, `MARK_PARTIAL`, `MARK_READY`, `OWNER_EMPTY_ACCOUNT` |
| `APPLICATION_DEFECT` | 2 | `IMPORT_NEEDS_MAPPING`, `PACK_ASSEMBLY_LOCKED` |
| `UNRESOLVED` | 0 | — |

## Failure matrix

### 1. DATA_WRONG_PASSWORD

- Family: Data Management
- Route / start / actual final / expected final: `/owner/data-management?tab=operational`
- Viewport / role / selected account: `360×800` / `OWNER` / `STAGE-FK-01`
- Fixture: `DataDeletionJob(stage4-delete-preview)`
- Required state: a real wrong-password reauthentication attempt must be rejected without executing the destructive operation.
- Actual state: the real `Purge QA operational data` disclosure and reauthentication form were open. The runner did not enter or submit a wrong password.
- Required actions: reauthentication form and `Cancel`.
- Actual actions: `Purge QA operational data` disclosure, `ownerPassword`, `confirmationPhrase`, submit, and `Cancel`; all measured at least 44 px high.
- Forbidden action/state: authorized completion or any operational purge.
- Failed assertion: `REQUIRED_VISIBLE_MISSING:Reauthenticate`; `REQUIRED_VISIBLE_MISSING:password`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/DATA_WRONG_PASSWORD__owner-data-management-tab-operational__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `app/owner/data-management/page.tsx`, `components/DataActionDetails.tsx`, `scripts/qa/stage4-5-capture.mjs`.
- Classification: `RUNNER_WRONG`.
- Reason: the scenario never performed the wrong-password interaction. The text contract is also stale (`Owner password` is the real label), but correcting text alone would still not prove wrong-password rejection.

### 2. IMPORT_AMAZON_THREE_ROLE

- Family: Imports
- Route / start / actual final / expected final: `/owner/product-inventory/refresh`
- Viewport / role / expected selected account: `360×800` / `OWNER` / `STAGE-AMZ-01`
- Fixtures: `amazon-all-listings.csv`, `catalog-one.csv`, `catalog-two.csv`
- Required state: Amazon account selected, three synthetic files retained, and the real upload action available.
- Actual state: all three file names were present, but the visible shell and form remained on `Synthetic Flipkart Primary`, `FLIPKART`, `STAGE-FK-01`.
- Required action: current upload action.
- Actual action: `Upload and start refresh` (216×48).
- Forbidden state: Flipkart account context.
- Failed assertions: `REQUIRED_VISIBLE_MISSING:3 files`; `REQUIRED_ACTION_MISSING:Start Import`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/IMPORT_AMAZON_THREE_ROLE__owner-product-inventory-refresh__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `scripts/qa/stage4-5-capture.mjs`, `app/owner/product-inventory/refresh/page.tsx`.
- Classification: `RUNNER_WRONG`.
- Reason: the runner's cookie-derived semantic metadata reported Amazon while the rendered authoritative account context was Flipkart. The assertion must also use the three visible file names and current button label, but account preparation must be fixed first.

### 3. IMPORT_CANCELLED

- Family: Imports
- Route / start / actual final / expected final: `/owner/imports/stage4-import-cancelled`
- Viewport / role / selected account: `360×800` / `OWNER` / `STAGE-FK-01`
- Fixture: `ImportJob(stage4-import-cancelled)`
- Required state: persisted `CANCELLED` status, no active processing state, and safe next actions.
- Actual state: status badge, status field, and current stage all showed `CANCELLED`; the job had finished.
- Required actions: safe navigation/new-upload actions.
- Actual actions: back/import/product-inventory/report links; no active runner mutation.
- Forbidden state: actual `RUNNING` job status.
- Failed assertion: `FORBIDDEN_VISIBLE_PRESENT:RUNNING`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/IMPORT_CANCELLED__owner-imports-stage4-import-cancelled__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `components/ImportJobProgress.tsx`, `app/owner/imports/[jobId]/page.tsx`, semantic registry.
- Classification: `CONTRACT_WRONG`.
- Reason: the global substring check matched the instructional sentence “Keep this owner PC running” rather than a lifecycle status. The contract must target the status/current-stage semantics.

### 4. IMPORT_COMPLETED

- Family: Imports
- Route / start / actual final / expected final: `/owner/imports/stage4-import-completed`
- Viewport / role / selected account: `360×800` / `OWNER` / `STAGE-FK-01`
- Fixture: `ImportJob(stage4-import-completed)`
- Required state: persisted `COMPLETED` status with completed totals and no active processing state.
- Actual state: `COMPLETED`, 100%, 100/100 rows, current stage `COMPLETED`, and completion actions were visible.
- Required actions: review, reports, Product Inventory, and navigation.
- Actual actions: `Open review`, summary downloads, Product Inventory, and navigation.
- Forbidden state: actual `RUNNING` job status.
- Failed assertion: `FORBIDDEN_VISIBLE_PRESENT:RUNNING`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/IMPORT_COMPLETED__owner-imports-stage4-import-completed__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `components/ImportJobProgress.tsx`, `app/owner/imports/[jobId]/page.tsx`, semantic registry.
- Classification: `CONTRACT_WRONG`.
- Reason: the same broad substring check matched “Keep this owner PC running,” not job status.

### 5. IMPORT_MULTI_FILE

- Family: Imports
- Route / start / actual final / expected final: `/owner/product-inventory/refresh`
- Viewport / role / selected account: `360×800` / `OWNER` / `STAGE-FK-01`
- Fixtures: `catalog-one.csv`, `catalog-two.csv`
- Required state: exactly two selected synthetic files and an enabled upload action.
- Actual state: both file names and sizes were visibly listed; the native file input retained exactly two files.
- Required action: upload/start action.
- Actual action: `Upload and start refresh` (216×48).
- Forbidden state: no selected files.
- Failed assertions: `REQUIRED_VISIBLE_MISSING:2 files`; `REQUIRED_ACTION_MISSING:Start Import`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/IMPORT_MULTI_FILE__owner-product-inventory-refresh__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `app/owner/product-inventory/refresh/page.tsx`, semantic registry.
- Classification: `CONTRACT_WRONG`.
- Reason: the UI lists each selected file instead of rendering the literal phrase “2 files,” and the approved button label is `Upload and start refresh`.

### 6. IMPORT_NEEDS_MAPPING

- Family: Imports
- Route / start / actual final / expected final: `/owner/imports/stage4-import-mapping`
- Viewport / role / selected account: `360×800` / `OWNER` / `STAGE-FK-01`
- Fixture: `ImportJob(stage4-import-mapping)` with `NEEDS_MAPPING`
- Required state: needs-mapping job with a safe path into the header-mapping form.
- Actual state: status and needs-mapping context were correct; the page exposed `Map File Headers`.
- Required action in current contract: `Save Profile and Retry`.
- Actual action: `Map File Headers`.
- Forbidden state: completed import.
- Failed assertion: `REQUIRED_ACTION_MISSING:Save Profile and Retry`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/IMPORT_NEEDS_MAPPING__owner-imports-stage4-import-mapping__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Control measurement: actual enabled `<a>` named `Map File Headers`, 138×38; its complete clickable box is also 138×38.
- Source: `app/owner/imports/[jobId]/page.tsx` (`ImportJobPage`, line containing the mapping link). The mapping form action exists only after navigating to `/owner/imports/[jobId]/mapping`.
- Classification: `APPLICATION_DEFECT`.
- Reason: the semantic contract is one navigation step ahead, but independently the real enabled link is below the project's 44 px minimum. It has `px-3 py-2`, no minimum height, no expanded wrapper, and no pseudo-element hit target.

### 7. IMPORT_ONE_FILE

- Family: Imports
- Route / start / actual final / expected final: `/owner/product-inventory/refresh`
- Viewport / role / selected account: `360×800` / `OWNER` / `STAGE-FK-01`
- Fixture: `catalog-one.csv`
- Required state: exactly one selected synthetic file and an enabled upload action.
- Actual state: `catalog-one.csv` was visible and the input retained exactly one file.
- Required action: upload/start action.
- Actual action: `Upload and start refresh` (216×48).
- Forbidden state: no selected file.
- Failed assertion: `REQUIRED_ACTION_MISSING:Start Import`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/IMPORT_ONE_FILE__owner-product-inventory-refresh__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `app/owner/product-inventory/refresh/page.tsx`, semantic registry.
- Classification: `CONTRACT_WRONG`.
- Reason: `Start Import` is an obsolete action name.

### 8. IMPORT_UPLOAD_EMPTY

- Family: Imports
- Route / start / actual final / expected final: `/owner/product-inventory/refresh`
- Viewport / role / selected account: `360×800` / `OWNER` / `STAGE-FK-01`
- Fixture: route-only empty upload form.
- Required state: no selected file, accepted-format guidance, and the real file-input/upload controls.
- Actual state: empty native file input, accepted-format guidance, and upload action were present.
- Required action: upload control.
- Actual action: `Upload and start refresh` (216×48).
- Forbidden state: selected file.
- Failed assertion: `REQUIRED_VISIBLE_MISSING:Choose files`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/IMPORT_UPLOAD_EMPTY__owner-product-inventory-refresh__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `app/owner/product-inventory/refresh/page.tsx`, semantic registry.
- Classification: `CONTRACT_WRONG`.
- Reason: the current accessible form label is `Catalog, listings, enrichment files, or ZIP`; it does not promise the browser-specific literal `Choose files`.

### 9. IMPORT_VALIDATION_ERROR

- Family: Imports
- Route / start / actual final / expected final: `/owner/uploads/stage4-upload-needs-mapping/review`
- Viewport / role / selected account: `360×800` / `OWNER` / `STAGE-FK-01`
- Fixture: `UploadBatch(stage4-upload-needs-mapping)`
- Required state: a genuine Flipkart validation-error import review.
- Actual state: `PDF parse review`, `Needs Mapping`, zero parsed/problem rows, and three review issues.
- Required actions: validation-review actions appropriate to the intended import.
- Actual actions: PDF review filters, `Apply`, `Upload another PDF`, and SKU image mappings.
- Forbidden state: completed import.
- Failed assertion: `REQUIRED_VISIBLE_MISSING:Flipkart import review`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/IMPORT_VALIDATION_ERROR__owner-uploads-stage4-upload-needs-mapping-review__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: upload-review route, `scripts/qa/stage4-6c-semantic-registry.mjs`.
- Classification: `FIXTURE_WRONG`.
- Reason: a needs-mapping PDF `UploadBatch` does not represent the named Product Inventory/Flipkart validation-error state.

### 10. MARK_COMPLETED

- Family: Marking
- Route / start / actual final / expected final: `/work/consignments/items/stage4-line-mark-completed-mark`
- Viewport / role / selected account: `360×800` / `MARKER` / `STAGE-FK-01`
- Fixture: completed `WorkTask(stage4-line-mark-completed-mark)`
- Required state: `MARK: COMPLETED`, completed by Synthetic Marker, quantity/history visible, and no normal completion action.
- Actual state: all required completed-state facts were visible and no completion action appeared.
- Required action in current contract: `Details`.
- Actual actions: `Scan Next`, `Back to Work`.
- Forbidden action: `Marking Completed`.
- Failed assertion: `REQUIRED_ACTION_MISSING:Details`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/MARK_COMPLETED__work-consignments-items-stage4-line-mark-completed-mark__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: consignment item Details route, semantic registry.
- Classification: `CONTRACT_WRONG`.
- Reason: the scenario is already on the Details page, so requiring another `Details` action is contradictory.

### 11. MARK_PARTIAL

- Family: Marking
- Route / start / actual final / expected final: current `/work/mark`; expected exact group Details route `/work/groups/MARK/591a89d7a1f4d309f2ab0b83b18157c9da8e54e3cc2d833633f1f10d8309a759?source=ORDER`
- Viewport / role / selected account: `360×800` / `MARKER` / `STAGE-FK-01`
- Fixture: `WorkTask(stage3-order-mark-progress-mark)`, MARK, `IN_PROGRESS`, required 2, completed 1, pending 1, assigned to Synthetic Marker.
- Required state: exact partial group card/details and partial-quantity action.
- Actual state: only the Mark source-summary page, showing Order and Consignment summary cards.
- Required action: `Save Partial Quantity`.
- Actual actions: source filters and summary-card links.
- Forbidden state: completed Mark action/state.
- Failed assertions: `REQUIRED_VISIBLE_MISSING:IN PROGRESS`; `REQUIRED_ACTION_MISSING:Save Partial Quantity`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/MARK_PARTIAL__work-mark__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `scripts/qa/stage4-5-scenarios.mjs`, `app/work/groups/[stage]/[groupKey]/page.tsx`.
- Classification: `RUNNER_WRONG`.
- Reason: the fixture and its projection membership are correct, but the runner opens the summary route instead of the deterministic exact group.

### 12. MARK_READY

- Family: Marking
- Route / start / actual final / expected final: current `/work/mark`; expected exact group Details route `/work/groups/MARK/045303fa94d9a1e580d6fd37cc0bf3c7d71301a5f90649466f27fee2c010eafa?source=ORDER`
- Viewport / role / selected account: `360×800` / `MARKER` / `STAGE-FK-01`
- Fixture: `WorkTask(stage3-order-mark-ready-mark)`, MARK, `READY`, required 1, completed 0, assigned to Synthetic Marker.
- Required state: exact ready group card/details and `Marking Completed`.
- Actual state: only the Mark source-summary page.
- Required action: `Marking Completed`.
- Actual actions: source filters and summary-card links.
- Forbidden state: completed Mark state.
- Failed assertions: `REQUIRED_VISIBLE_MISSING:READY`; `REQUIRED_ACTION_MISSING:Marking Completed`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/MARK_READY__work-mark__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: `scripts/qa/stage4-5-scenarios.mjs`, `app/work/groups/[stage]/[groupKey]/page.tsx`.
- Classification: `RUNNER_WRONG`.
- Reason: the fixture and projection are correct; the runner does not navigate to the exact group that renders the state/action.

### 13. OWNER_EMPTY_ACCOUNT

- Family: Owner/account lifecycle
- Route / start / actual final / expected final: `/accounts`
- Viewport / role: `360×800` / `OWNER`
- Fixture preparation: temporarily deactivated synthetic accounts.
- Required state: zero active accounts, no selected account, owner explanation, and `Create First Seller Account`; no worker-only wording or populated selector.
- Actual state: zero-account owner explanation and `Create First Seller Account` were correct, but the context still retained a stale `STAGE-FK-01` selected-account cookie. The page heading remained `Choose seller account`, though no populated account rows were rendered.
- Required action: `Create First Seller Account` (205×44).
- Actual action: `Create First Seller Account`.
- Forbidden state: worker-only `Ask the owner` and a populated account choice.
- Failed assertion: `FORBIDDEN_VISIBLE_PRESENT:Choose seller account`.
- Evidence path: planned `.codex-tmp/ui-state-atlas/current/70265f9a.../full-page/OWNER_EMPTY_ACCOUNT__accounts__360x800__FULL-PAGE@2x.png`; trace and DOM result preserved.
- Browser/network: clean.
- Source: account page, semantic registry, temporary account preparation in `scripts/qa/stage4-5-capture.mjs`.
- Classification: `RUNNER_WRONG`.
- Reason: the runner must clear the selected-account cookie and assert absence of account rows, not forbid a neutral page heading.

### 14. PACK_ASSEMBLY_LOCKED

- Family: Packing
- Route / start / actual final / expected final: `/packing/STAGE-AWB-ASSEMBLY-LOCKED`
- Viewport / role / selected account: `360×800` / `PACKER` / `STAGE-FK-01`
- Fixture: `WorkTask(stage4-order-pack-assembly-locked-pack)`
- Required state: Assembly prerequisite visibly blocks Packing and `Confirm packed` is absent.
- Actual state: semantic contract passed; Assembly was correctly required and Packing remained blocked.
- Required actions: safe scanner navigation and problem reporting only.
- Actual actions: `Scan next`, product image gallery, `Mark problem`, `Save problem`, recent scan log, and `Scan next AWB`.
- Forbidden action: `Confirm packed` (absent).
- Semantic assertion: passed; entry failed only the touch-target gate.
- Screenshot: `.codex-tmp/ui-state-atlas/current/70265f9a1b6e2fb9b702bef88feded586b031bfa/full-page/PACK_ASSEMBLY_LOCKED__packing-STAGE-AWB-ASSEMBLY-LOCKED__360x800__FULL-PAGE@2x.png` (private/untracked).
- Browser/network: clean.
- Control measurements:
  - enabled `<a>` `Scan next`: visible and complete clickable box 87×38;
  - enabled `<summary>` `Mark problem`: visible and complete clickable box 302×24.
- Source: `app/packing/[awb]/page.tsx` (`ScanResultPage`).
- Classification: `APPLICATION_DEFECT`.
- Reason: both measurements are on the true interactive elements. `Scan next` has `px-3 py-2` but no minimum height. `Mark problem` has no padding or minimum height. Neither has an expanded interactive wrapper or pseudo-element hit target. Both are enabled operational controls and the 44×44 rule applies.

## Touch-target conclusion

| Control | True element | Visible box | Complete click box | Source | Result |
| --- | --- | ---: | ---: | --- | --- |
| Map File Headers | enabled `<a>` | 138×38 | 138×38 | `app/owner/imports/[jobId]/page.tsx` | `APPLICATION_DEFECT` |
| Scan next | enabled `<a>` | 87×38 | 87×38 | `app/packing/[awb]/page.tsx` | `APPLICATION_DEFECT` |
| Mark problem | enabled `<summary>` | 302×24 | 302×24 | `app/packing/[awb]/page.tsx` | `APPLICATION_DEFECT` |

The atlas selector inspected the actual interactive elements:
`a[href], button, input, select, textarea, summary, [role=button], [role=tab]`.
The measurements were not taken from nested text spans. No global CSS expands
these three hit areas.

## Stop decision

At least one genuine runtime application defect remains. Under the Stage
4.6C3C stop rule:

- no semantic contracts or fixtures were changed;
- no runtime application source was changed;
- no build was run;
- no Batch 02 recapture was run;
- Batch 03 was not started;
- no other viewport was started.

Result: `STAGE4_6C3C_BLOCKED_APPLICATION_DEFECT`

## Stage 4.6C3E current-runtime reconciliation

This section records the QA-only reconciliation against the current frozen
runtime. It does not promote or reuse evidence from the historical runtime.

- Current runtime SHA: `b15fd367068c6bda754b9ffd7aab46a03b22b322`
- Current runtime BUILD_ID: `si6GMY3CKc6-Bc0XwtVVd`
- Current runtime tag: `phase-7.3.6-stage4.6c3d-frozen-rc`
- Historical runtime evidence label: `HISTORICAL_PRE_C3D_RUNTIME_EVIDENCE`
- Semantic registry: `stage4.6c3e-semantic-v3`
- Synthetic fixture version: `phase-7.3.6-stage4.6c3e-batch02-fixtures-v3`
- Full-page screenshots taken in this reconciliation: zero
- Current-runtime Batch 02 atlas recapture: not started

The 14-state semantic-only preflight at `360x800` passed 14/14. The targeted
two-width check passed 27/28 entries. The sole failure is a current-runtime
touch-target defect described below, so the checkpoint stopped before the
QA-only commit, push, plan creation, or Batch 02 recapture.

| Scenario | Previous class | Correction and authoritative state | Fixture / role / account | Route and actions | Preflight | Current class |
| --- | --- | --- | --- | --- | --- | --- |
| `DATA_WRONG_PASSWORD` | `RUNNER_WRONG` | Submit the real owner reauthentication form with an intentionally wrong synthetic password; verify rejection, unchanged operational row counts, and no owner-action grant. | `DataDeletionJob(stage4-delete-preview)` / OWNER / `STAGE-FK-01` | `/owner/data-management?tab=operational`; real purge disclosure and owner-password form; successful purge forbidden. | Passed at both widths. | `RECONCILED` |
| `IMPORT_AMAZON_THREE_ROLE` | `RUNNER_WRONG` | Select Amazon through the real account form and verify the hydrated shell/form show AMAZON and all three exact filenames. | three synthetic files / OWNER / `STAGE-AMZ-01` | `/owner/product-inventory/refresh`; `Upload and start refresh` required; Flipkart context forbidden. | Passed at both widths. | `RECONCILED` |
| `IMPORT_CANCELLED` | `CONTRACT_WRONG` | Match labelled status and current stage `CANCELLED`; do not reject instructional prose containing “running.” | `ImportJob(stage4-import-cancelled)` / OWNER / `STAGE-FK-01` | `/owner/imports/stage4-import-cancelled`; safe navigation required; lifecycle `RUNNING` forbidden. | Passed at both widths. | `RECONCILED` |
| `IMPORT_COMPLETED` | `CONTRACT_WRONG` | Require persisted `COMPLETED`, 100%, and completed totals without a global “running” substring check. | `ImportJob(stage4-import-completed)` / OWNER / `STAGE-FK-01` | `/owner/imports/stage4-import-completed`; completion/report actions required; lifecycle `RUNNING` forbidden. | Passed at both widths. | `RECONCILED` |
| `IMPORT_MULTI_FILE` | `CONTRACT_WRONG` | Inspect the native file input for exactly two files and verify both exact names. | `catalog-one.csv`, `catalog-two.csv` / OWNER / `STAGE-FK-01` | `/owner/product-inventory/refresh`; `Upload and start refresh` required. | Passed at both widths. | `RECONCILED` |
| `IMPORT_NEEDS_MAPPING` | repaired application plus stale contract | Keep job and mapping pages separate. The job page requires `Map File Headers`; the mapping page enables `Save Profile and Retry` only after valid required-field mappings. | `ImportJob(stage4-import-mapping)` / OWNER / `STAGE-FK-01` | Job `/owner/imports/stage4-import-mapping`; mapping `/owner/imports/stage4-import-mapping/mapping`; no submission. | Passed at both widths. | `RECONCILED` |
| `IMPORT_ONE_FILE` | `CONTRACT_WRONG` | Inspect the native input for exactly `catalog-one.csv`; use the current upload label. | one synthetic file / OWNER / `STAGE-FK-01` | `/owner/product-inventory/refresh`; `Upload and start refresh` required. | Passed at both widths. | `RECONCILED` |
| `IMPORT_UPLOAD_EMPTY` | `CONTRACT_WRONG` | Require zero native files, the accessible current file-input label, accepted-format guidance, and the current upload action. | route-only fixture / OWNER / `STAGE-FK-01` | `/owner/product-inventory/refresh`; browser-dependent “Choose files” text is not required. | Passed at both widths. | `RECONCILED` |
| `IMPORT_VALIDATION_ERROR` | `FIXTURE_WRONG` | Use a real failed Product Inventory ImportJob at `VALIDATING`, two sanitized blocking issues, a retained synthetic source, no completed merge, and no worker task leak. | `ImportJob(stage4-import-validation-error)` plus safe issue rows / OWNER / `STAGE-FK-01` | `/owner/imports/stage4-import-validation-error`; `View Blocking Errors` required; completed state forbidden. | Passed at both widths. | `RECONCILED` |
| `MARK_COMPLETED` | `CONTRACT_WRONG` | Require completed MARK facts, worker/history, `Scan Next`, and `Back to Work`; normal mutation action forbidden. | `WorkTask(stage4-line-mark-completed-mark)` / MARKER / `STAGE-FK-01` | Exact completed task Details route; a second `Details` link is not required. | Passed at both widths. | `RECONCILED` |
| `MARK_PARTIAL` | `RUNNER_WRONG` | Resolve the exact current group from the real task/projection. Required 2, completed 1, pending 1 means final completion is supported and another partial save is correctly absent. | `WorkTask(stage3-order-mark-progress-mark)` / MARKER / `STAGE-FK-01` | Exact `/work/groups/MARK/<group>?source=ORDER`; `Marking Completed` required; false completed state and impossible partial save forbidden. | Passed at both widths. | `RECONCILED` |
| `MARK_READY` | `RUNNER_WRONG` | Resolve the exact current READY group with zero completed quantity and satisfied Pick prerequisite. | `WorkTask(stage3-order-mark-ready-mark)` / MARKER / `STAGE-FK-01` | Exact `/work/groups/MARK/<group>?source=ORDER`; normal `Marking Completed` action required. | Passed at both widths. | `RECONCILED` |
| `OWNER_EMPTY_ACCOUNT` | `RUNNER_WRONG` | Temporarily isolate all synthetic accounts, clear both staging and legacy selected-account cookies, and assert zero account radio rows. | temporary disposable staging state / OWNER / no selected account | `/accounts`; `Create First Seller Account` required; populated selector and worker-only wording forbidden. | Passed at both widths. | `RECONCILED` |
| `PACK_ASSEMBLY_LOCKED` | repaired application scenario | Assembly remains incomplete; Packing stays locked; `Confirm packed` is absent; safe scanner/problem actions remain. | `WorkTask(stage4-order-pack-assembly-locked-pack)` / PACKER / `STAGE-FK-01` | `/packing/STAGE-AWB-ASSEMBLY-LOCKED`; semantic state passed at both widths. | Semantic pass, but `1440x900` touch-target gate failed. | `APPLICATION_DEFECT` |

### Remaining current-runtime defect

At `1440x900`, the lower enabled `Scan next AWB` link on the Assembly-locked
Packing page measured `128x43`. Its semantic state, browser console, page,
network, overflow, and authentication checks were otherwise clean. The strict
minimum is `44x44`; therefore `43` pixels is not rounded up or waived.

The earlier runtime repair changed the top `Scan next` link and the
`Mark problem` summary, but this separate lower `Scan next AWB` link remains a
true enabled operational target below the required height. Stage 4.6C3E does
not authorize runtime application edits, so no runtime source was changed.

Current result: `STAGE4_6C3E_BLOCKED_APPLICATION_DEFECT`
