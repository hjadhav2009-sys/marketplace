# Phase 7.4C3C — Grouped Mark Determinism and Canonical Entry Closure

## Result

`PHASE_7_4C3C_GROUPED_MARK_AND_ENTRY_CLOSED`

Phase 7.4C3C closes the grouped Mark destination defect and makes `/work/mark` the canonical Mark worker entry. It does not redesign C3, begin C4, or change the individual C3A/C3A.1/C3A.2 transition services.

## Boundary and commits

- Starting branch: `phase-7.4c3b-professional-mark-experience`
- Starting final HEAD: `1727a1c7a606a0f59762f64efdda507ab2f07f7d`
- Starting browser-tested runtime: `e6861588c9302b2bd98071b5c05e295e5fa11820`
- Starting BUILD_ID: `iS5PbnvHDoD1UcU8HCofP`
- Implementation branch: `phase-7.4c3c-grouped-mark-determinism-entry-closure`
- Runtime commit: `60516ff034da5f447a1a4b435461139885ecae9d`
- Final exact-build BUILD_ID: `TFsl3e-2u1bS8ExuL0jlI`
- Final branch HEAD: the documentation commit containing this report; the exact pushed SHA is recorded in the final handoff and `origin/phase-7.4c3c-grouped-mark-determinism-entry-closure`.

The starting worktree was clean. The starting runtime-to-final C3B diff contained only the C3B report and its QA-only one-line browser assertion adjustment. Staging was stopped, port 3188 had no listener, and Prisma and `mobile-app` were clean.

## Reproduction and root cause

The pre-repair disposable SQLite test printed:

```text
CONFIRMED_GROUPED_PRESELECTED_MARK_COMPLETION_DEFECT
CONFIRMED_GROUPED_MARK_PARTIAL_MEMBER_REPRO_IS_STRUCTURALLY_UNREACHABLE_WITH_EXACT_NON_PACK_GROUPS
```

Grouped completion and member-finish code used `recommendedNextStage(snapshot, "MARK")`. That read the older `recommendedStages` default even when `actualStages` already established Assembly or Pack as the authoritative next stage. Consequently a saved Pick → Mark → Pack recommendation could supersede a previously selected Pick → Mark → Assembly route.

Current non-Pack projection grouping is deliberately exact by source record (`ORDER_ITEM:<id>` or `CONSIGNMENT_LINE:<id>`), and schema uniqueness permits only one Mark task for a source/stage. Therefore a genuine multi-member Mark group is not constructible in the current projection. Full-group completion and exact-member completion were still vulnerable. The dormant partial-member path was hardened and verified through a deliberately coalesced legacy-compatibility projection; the report does not claim that such a group is produced by current normal projection code.

## Shared destination semantics

`src/lib/workflow/grouped-completion-destination.ts` centralizes the grouped completion rule using `resolveForwardStageEligibility()`:

- a preselected Assembly or Pack destination is authoritative;
- `useRecommendedNextStage` continues to that selected destination instead of reverting to the old product default;
- an explicit attempt to replace preselected Assembly with Pack, or Pack with Assembly, is rejected without mutation;
- unresolved Mark keeps its existing recommendation/Process Flow behavior;
- Pick and Pack behavior remains unchanged.

For a preselected destination, completion adds Mark to `completedStages`, advances `currentStage`, increments the snapshot version, and leaves `actualStages` and existing decisions unchanged. It does not re-run override reasoning, resolve mutable catalog settings, create a duplicate route decision, or overwrite prepared downstream metadata.

The downstream task guard requires the exact account, source record, stage and immediate sequence. It accepts only a compatible locked, zero-progress, unassigned/unstarted/uncompleted task with matching card provenance and route snapshot. Missing, mismatched, progressed, assigned, `IN_PROGRESS`, `PROBLEM`, `COMPLETED`, cancelled or skipped downstream work fails safely.

The same rule now governs:

- full grouped completion in `completeGroupedStage()`;
- member completion during `setGroupedProgress()`;
- exact-member completion in `completeSelectedGroupMembers()`.

Idempotent replay reads the persisted `nextStage` from the action log. It no longer reconstructs Assembly as Pack from stale recommendation data.

## Regression results

The focused disposable-database suite proves:

- unresolved Mark → Pack and unresolved Mark → Assembly still succeed with existing decision behavior;
- preselected Assembly and preselected Pack complete to their selected stages;
- both crafted replacement directions reject without mutation;
- exact-member completion unlocks the selected Assembly task and leaves Pack locked;
- ordinary partial progress remains on Mark;
- legacy-coalesced partial member completion sends finished members to Assembly while unfinished work remains Mark;
- preselected snapshots keep `actualStages` and decisions unchanged and preserve immutable downstream metadata;
- replay mutates once and returns the actual next stage;
- stale version, unsafe downstream state, no-Mark permission, assignment and account boundaries reject safely.

## Canonical Mark entry

- Owner and worker Marking navigation now targets `/work/mark`.
- `/work/marking` remains an owned legacy path so active-navigation state is retained for search/history/detail routes.
- Plain/default `/work/marking` redirects to `/work/mark?source=CONSIGNMENT`, preserving safe success/error feedback.
- Exact `q` search and `status=problem` or `status=completed` remain on the legacy searchable/history queue.
- `/work/marking/[taskId]` remains permanent and permission/account isolated.
- Its normal Back to Marking link now targets `/work/mark?source=CONSIGNMENT`.

## Browser mutation proof

Engine: installed Google Chrome via repository `playwright-core`.

Environment: `PRIVATE_SYNTHETIC_STAGING`, private SQLite, `127.0.0.1:3188`, exact runtime `60516ff034da5f447a1a4b435461139885ecae9d`, BUILD_ID `TFsl3e-2u1bS8ExuL0jlI`.

Focused browser result: **13/13 passed**.

At both `390×844` and `1440×900`, a real synthetic Marker selected its assigned account, used the rendered Marking navigation, and landed on `/work/mark`. Plain legacy redirect, exact-search compatibility and permanent detail access passed.

Actual submitted preselected Assembly completion produced:

```text
Mark status          COMPLETED
Assembly status      READY
Pack status          LOCKED
actualStages         PICK, MARK, ASSEMBLE (unchanged)
completedStages      PICK, MARK
currentStage         ASSEMBLE
route decisions      0
completion actions   1
```

Actual submitted preselected Pack completion produced Pack `READY`, `currentStage=PACK`, unchanged `actualStages`, zero route decisions and one completion action. The normal partial fixture moved from quantity 3 to 4, remained Mark `IN_PROGRESS`, and left Pack locked. The unresolved Process Flow still exposed both Pack and Assembly. A separate synthetic Assembler session saw the newly ready Assembly card.

Across monitored states:

- console errors: 0
- page errors: 0
- unexpected failed requests: 0
- HTTP error responses: 0
- focused document overflow: 0
- focused undersized operational controls: 0

The browser-mutated synthetic database was reset after the final pass. The restored database integrity check returned `ok` and `productionPathsReferenced` remained `false`.

## Validation

All required commands passed:

```text
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run phase7.4b2:test
npm.cmd run phase7.4c1:test
npm.cmd run phase7.4c1a:test
npm.cmd run phase7.4c1a1:test
npm.cmd run phase7.4c2:test
npm.cmd run phase7.4c3a:test
npm.cmd run phase7.4c3a1:test
npm.cmd run phase7.4c3a2:test
npm.cmd run phase7.4c3:test
npm.cmd run phase7.4c3c:test
npm.cmd run phase7.4c3c:browser
npm.cmd run direct-stage-actions:test
npm.cmd run workflow:test
npm.cmd run grouped-details:test
npm.cmd run stage4-6a:test
npm.cmd run stage4-6:test
git diff --check
```

Full lint completed with zero errors; its 152 warnings are the existing checked-in Impeccable-tooling warnings. The final QA-only browser adjustment also passed focused ESLint and the focused C3C source suite was rerun green.

## Protected boundary and final state

- `task-store.ts`: unchanged
- `stage-transition.ts`: unchanged
- `route-decision-policy.ts`: unchanged
- `route-selection.ts`: unchanged
- `order-pack-scope.ts`: unchanged
- `workflow-prerequisites.ts`: unchanged
- Prisma/schema/migrations: unchanged
- PostgreSQL: untouched
- `mobile-app`: unchanged
- dependencies: none added
- real data: untouched
- production paths: not referenced
- staging: stopped
- port 3188: no listening process (post-browser `TIME_WAIT` connections only)
- deployment/merge/PR: not performed
- C4: not started

