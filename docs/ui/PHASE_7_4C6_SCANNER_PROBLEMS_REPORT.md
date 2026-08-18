# Phase 7.4C6 Scanner and Problems Report

## Result

Phase 7.4C6 gives workers a professional, input-first Universal Scanner and replaces the Consignment-only Problems queue with one permission-aware Customer Order and Consignment workspace. It also closes the C5 cross-surface Pack assignment mismatch without weakening the authoritative Pack service.

Result marker: `PHASE_7_4C6_PROFESSIONAL_SCANNER_PROBLEMS_COMPLETE`

## Boundary and runtime identity

- Starting branch: `phase-7.4c5-professional-pack-experience`
- Starting C5 final HEAD: `40151d3a19fc10398ce0eb985cf6efa254bbedce`
- Starting tested runtime SHA: `f72f9a61951f7eb414f86d69b4b010cce103c1e4`
- Starting BUILD_ID: `nOZcrjEeon8dYXpqTAK_e`
- C6 branch: `phase-7.4c6-professional-scan-problems`
- Final C6 runtime SHA: `1afa05b28e02afbb7b16079f406ed14963c41fe3`
- Final C6 BUILD_ID: `bIzU-AXWqEzFm_cihKYUz`
- Browser: installed Google Chrome through repository `playwright-core`
- Environment: `PRIVATE_SYNTHETIC_STAGING` at `127.0.0.1:3188`
- Database: disposable private SQLite fixture only
- Final branch HEAD: the documentation-only closure commit; its exact pushed SHA is reported in the final handoff because a commit cannot contain its own hash.

The final browser report names the exact runtime SHA and BUILD_ID above. No application runtime file changed after that build and browser pass.

## Changed files

Runtime/read-model foundation:

- `src/lib/workflow/order-pack-actor-eligibility.ts`
- `src/lib/workflow/order-pack-scope.ts`
- `src/lib/workflow/grouped-work.ts`
- `src/lib/workflow/universal-resolver.ts`
- `src/lib/workflow/universal-actions.ts`
- `src/lib/workflow/problems-workspace.ts`

Scanner and compatibility surfaces:

- `app/work/scan/page.tsx`
- `app/work/scan/actions.ts`
- `app/packing/page.tsx`
- `components/ProfessionalUniversalScanner.tsx`
- `components/UniversalScanInput.tsx`
- `components/ScannerDetailsButton.tsx`
- `components/ScannerMarkRouteDialog.tsx`

Problems and Pack presentation:

- `app/work/problems/page.tsx`
- `app/work/problems/ProfessionalProblemsPage.tsx`
- `app/work/problems/actions.ts`
- `components/ProblemWorkspaceCard.tsx`
- `app/work/pack/PackWorkCard.tsx`

QA and source contracts:

- `tests/phase-7-4c6-professional-scanner-problems.test.tsx`
- `scripts/qa/phase-7-4c6-browser.mjs`
- `package.json`
- six existing source-contract tests updated for the reviewed authoritative Pack fingerprint and unified Problems read model.

The runtime commit contains 27 files, 986 insertions and 55 deletions. No dependency was added. `package-lock.json` is unchanged.

## Preflight findings and repair

### Pack actor eligibility

Disposable SQLite reproduced a package whose Pack tasks were assigned to Packer A while the actor was OWNER. The authoritative service rejected the mutation while the C5 canonical card and Scanner could still imply availability.

Preflight markers:

- `CONFIRMED_PACK_ACTOR_ELIGIBILITY_UI_GAP`
- `CONFIRMED_SCANNER_PACK_ASSIGNMENT_ELIGIBILITY_GAP`

`resolveOrderPackActorEligibility()` now owns the pure actor-specific rule: every active Pack task must be unassigned or assigned to the current actor. The authoritative Order Pack service, canonical `/work/pack` read model, and Universal Scanner all call that same helper. OWNER follows the same rule. A blocked package shows `Packing assignment conflict` / `Packing work is assigned to another worker`, safe worker names where useful, and no `Pack Completed` control. User IDs are not rendered and no automatic reassignment occurs.

### Unresolved Consignment Mark

Disposable SQLite reproduced a real Mark task with `actualStages = [PICK, MARK]`, `completedStages = [PICK]`, and two legal forward destinations. The old Scanner exposed generic completion even though the backend correctly required Process Flow selection.

Preflight marker: `CONFIRMED_SCANNER_UNRESOLVED_MARK_ACTION_GAP`.

The Scanner now reuses `resolveForwardStageEligibility()`. An unresolved Mark opens the established Process Flow overlay and delegates to `completeStageAndChooseNext()` through the Scanner adapter. Deterministic Pack or Assembly handoffs use the existing deterministic completion. Malformed route truth is read-only and explains why Details must be opened. The backend guard was not weakened.

## Professional Universal Scanner

- Canonical route remains `/work/scan`.
- Selected-account lookup remains mandatory and server-authoritative; no cross-assigned-account search was added.
- Scanning performs no mutation.
- The explicit `Scan code` field is the hero control, supports Enter, preserves/selects the query on error, and is ready for the next scan after a successful action.
- Stage and source filters remain visible but subordinate.
- The normal Packing shortcut is `Pack workspace` to `/work/pack`; `/packing` remains compatibility-only.
- Candidate cards use one hierarchy: source/marketplace, exact operational reference, product identity, workflow/readiness, quantity, assignment/problem state, then actions.
- Package scans produce one physical package candidate; genuinely different SKU matches remain separate and labelled.
- Completed work is read-only with Details and Scan Next only.
- Problem work exposes Open Problem/Details/Scan Next according to permission and never completes through an unrelated action.
- Action language is `Complete Pick`, `Marking Completed`, `Assembly Completed`, and `Pack Completed`; generic `Complete stage` is absent.
- Scanner Details uses the existing responsive worker overlay and retains a full-record link.
- Workflow labels now say `Pick`, `Marking`, `Assembly`, and `Pack`; generic `work` no longer substitutes for a known Pick stage.

Identifier priority and exact-match behavior remain in the existing resolver architecture for AWB, Tracking ID, FNSKU, Seller SKU, FSN, ASIN, Listing ID, barcode, Order/Shipment/Item references, WorkTask ID, and Consignment number.

## Unified Problems workspace

`/work/problems` now presents one workspace with compact source counts for Customer Orders and Consignments plus a server-side All/Pick/Marking/Assembly/Pack filter and preserved pagination.

Customer Order source:

- reads open `ProblemOrder` records joined to the exact interrupted `WorkTask`;
- preserves existing visibility policy;
- exposes resolution only to OWNER;
- delegates to `resolveOrderWorkflowProblem()`;
- never reconstructs historical stage truth from current processing rules.

Consignment source:

- reads exact Consignment `WorkTask` rows in `PROBLEM`;
- preserves `userCanResolveConsignmentProblems()` and management policy;
- delegates to `resolveWorkTaskProblem()` and `reassignWorkTask()`;
- offers only workers authorized for the interrupted stage;
- keeps the Problem open when reassignment changes ownership.

Both sources use a shared card grammar: Work paused, source/reference, interrupted stage, reason/note, quantity, assignment, reporter/time, and permission-derived actions. Resolve and Reassign use the existing responsive overlay as a mobile sheet and desktop dialog instead of embedding large forms below every card. Read-only users receive Details only. Marketplace capability truth suppresses unsupported Amazon Daily Order Problems.

Timestamps use the existing stable `en-IN` / `Asia/Kolkata` formatter. This corrected a browser-found server/client locale hydration mismatch. The Problems grid and pagination explicitly allow zero-minimum tracks and wrapping, which corrected 200% reflow without global overflow clipping.

## Stage restore, permissions, and idempotency

Disposable database tests prove:

- Order Assembly Problem resolution leaves Pick and Mark completed, restores Assembly only, and leaves Pack locked;
- Consignment Mark Problem resolution leaves Pick completed and restores Mark only;
- stage-compatible reassignment lists exclude incompatible workers;
- duplicate/report/resolve request behavior remains owned by the existing receipt and mutation services;
- wrong account, removed permission, stale state, and actor reuse remain rejected by existing service tests;
- canonical Pack, Scanner, and authoritative Pack mutation now agree on actor eligibility.

The C2 Pick, C3 Mark, C4 Assembly, and C5 Pack engines were not rewritten. Scanner remains an adapter/read model and Problems remains a workspace/read model over the approved mutation services.

## Validation

Passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — zero errors; 152 warnings are confined to bundled `.agents/skills/impeccable` tooling
- `npm.cmd run phase7.4b2:test`
- `npm.cmd run phase7.4c1:test`
- `npm.cmd run phase7.4c1a:test`
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run phase7.4c2:test`
- `npm.cmd run phase7.4c3:test`
- `npm.cmd run phase7.4c3a:test`
- `npm.cmd run phase7.4c3a1:test`
- `npm.cmd run phase7.4c3a2:test`
- `npm.cmd run phase7.4c3c:test`
- `npm.cmd run phase7.4c4:test`
- `npm.cmd run phase7.4c4a:test`
- `npm.cmd run phase7.4c4a1:test`
- `npm.cmd run phase7.4c5:test`
- `npm.cmd run phase7.4c6:test`
- `npm.cmd run universal-scan:test`
- `npm.cmd run selected-account-scanner:test`
- `npm.cmd run grouped-pack-safety:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run grouped-details:test`
- `npm.cmd run live-work:test`
- `npm.cmd run live-work-load:test`
- `npm.cmd run stage4-ui:test`
- `npm.cmd run stage4-6a:test`
- `npm.cmd run production-audit-hardening:test`
- `git diff --check`

The production audit confirms 488 exact reviewed ORM mutation call sites and 5 reviewed raw-SQL mutation call sites. The C6 changes add no ORM write path.

## Browser evidence

Final report: `.codex-tmp/phase-7-4c6/browser-report.json` (ignored, not committed).

The final exact-build run passed 28/28 records. Scanner package results and representative Customer Order/Consignment Problems passed at:

| Viewport | Scanner | Order Problems | Consignment Problems | Overflow | Enabled controls below 44px |
| --- | --- | --- | --- | --- | --- |
| 360 x 800 | Passed | Passed | Passed | 0 | 0 |
| 390 x 844 | Passed | Passed | Passed | 0 | 0 |
| 430 x 932 | Passed | Passed | Passed | 0 | 0 |
| 768 x 1024 | Passed | Passed | Passed | 0 | 0 |
| 1024 x 768 | Passed | Passed | Passed | 0 | 0 |
| 1440 x 900 | Passed | Passed | Passed | 0 | 0 |

Additional exact-build states passed: unresolved Mark Process Flow and focus return, completed read-only, mobile and desktop multiple matches, mobile resolve sheet, desktop resolve dialog, and 200% reflow for Scanner package, Scanner multiple results, Order Problems, Consignment Problems, and Resolve.

Browser health:

- console errors: 0
- page errors: 0
- unexpected request failures: 0
- HTTP error responses: 0
- document overflow failures: 0
- undersized enabled controls: 0
- duplicate current-navigation states: 0

The mutation safety matrix is covered by the disposable database/service suites for Order and Consignment Pick, unresolved/deterministic Mark, deterministic Assembly, Order/Consignment Pack, assignment conflict, stale state, permission removal, wrong account, duplicate request, and completed state. The browser suite validates their final read/action grammar without weakening or replacing those services.

Role evidence combines C6 browser sessions for OWNER, Marker, and Packer with the required C2-C5 permission regressions for Picker, Assembler, view-all read-only, Problem reporter, no applicable permission/no account, and Consignment management. All rendered actions remain derived from server permissions.

Owner-review screenshots are under `.codex-tmp/phase-7-4c6/owner-review/` and are ignored. They include every requested 390px and 1440px Scanner, multiple-match, Problems, and Resolve state.

## Design review

Impeccable was scoped to the changed Scanner/Problems controls and surfaces. Its deterministic detector reported nine `gray-on-color` warnings. All nine are false positives caused by conditional or sibling class names sharing a compact JSX source line: rendered colored regions use `text-teal-*` on teal, `text-rose-*` on rose, and `text-amber-*` on amber; the reported slate text is outside those colored regions. No palette change was made to silence the detector.

Taste review: the surfaces retain the Operations Ledger identity and avoid generic dashboard decoration. Hierarchy comes from operational source, status, exact reference, and action—not cards inside cards, gradients, oversized typography, or ornamental motion.

Emil review: the Scanner keeps the frequent action adjacent to the input/result, overlays reuse established focus entry/return and Escape behavior, errors preserve a retryable scan value, and no decorative animation or animation dependency was introduced. Reduced-motion behavior is inherited from the worker overlay system.

Fresh Impeccable finish-review disposition: `ship`.

The reviewer confirmed persistence, fidelity, and ceiling; found no material fixes; accepted the 390px sheet and 1440px dialog adaptations; and specifically recommended preserving the input-first scan loop, dense workflow truth beside each action, and restrained semantic color hierarchy.

This is an ordinary extension of the established design world, so `DESIGN.md` and `.impeccable/design.json` do not require a new visual-system direction.

## Protected boundaries and closure

- Prisma schema/migrations: unchanged
- PostgreSQL: untouched
- `mobile-app`: unchanged
- real data/storage: untouched
- dependencies added: none
- client JavaScript: limited to the new Scanner Mark route dialog and Problem/Details overlay triggers; server permission/read models remain server-side
- staging: stopped after final evidence
- port 3188: closed after final evidence
- push: recorded in the final handoff
- worktree: clean after the documentation-only closure commit

No PR was opened, nothing was merged or deployed, and no D-series owner/admin redesign was started.
