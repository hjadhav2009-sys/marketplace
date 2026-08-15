# Phase 7.4C3A.1 Mark COMPLETE Path Safety Report

## Result

`PHASE_7_4C3A1_MARK_COMPLETE_PATH_SAFETY_CLOSED`

This checkpoint closes the crafted generic `COMPLETE` path for unresolved Mark route choices. C3 UI work did not resume.

## Starting boundary

- Required completed branch: `phase-7.4c3a-mark-progress-safety`
- Verified local and remote HEAD: `75caf31d3d96bd729c44f79d1cb1fabebdc12de7`
- Starting browser-tested runtime: `9e58ea05f4bc228ef79a73dc18d73d01a68f5f45`
- Starting BUILD_ID: `n-ucY6dLOJm6_SEXvXk1C`
- Required prior result: `PHASE_7_4C3A_MARK_PROGRESS_BYPASS_CLOSED`
- Implementation branch: `phase-7.4c3a1-mark-complete-path-safety`
- Starting worktree: clean
- Starting staging: stopped
- Starting port 3188: closed

The commits after the starting runtime contained only the C3A test enhancement, browser harness adjustment, and documentation. No later marketplace runtime source change was present.

## Package metadata cleanup

`package.json` contained the same `phase7.4c3a:browser` key twice. The duplicate was removed; exactly one remains:

```json
"phase7.4c3a:browser": "node scripts/qa/phase-7-4c3a-browser.mjs"
```

The new `phase7.4c3a1:test` command runs the expanded disposable-SQLite completion-path regression. No dependency or unrelated command changed.

## Crafted COMPLETE reproduction

Before production code was edited, a fresh canonical Mark fixture proved two unresolved destinations:

```text
stage              MARK
required/completed 6/0
actualStages       PICK, MARK
completedStages    PICK
selectable stages  ASSEMBLE, PACK
Pack               LOCKED
Assembly tasks     0
```

A direct crafted call to `completeWorkTask(...)` produced:

| State | Before | After |
|---|---|---|
| Mark | `READY`, `0/6`, unassigned | `COMPLETED`, `6/6`, assigned to marker |
| Pack | `LOCKED` | `READY` |
| Assembly count | `0` | `0` |
| route-decision count | `0` | `0` |
| routed-audit count | `0` | `0` |
| action-log count | `0` | `2` (`TASK_CLAIMED` and generic `TASK_COMPLETED`) |

The executable reproduction printed `CONFIRMED_COMPLETE_PATH_BYPASS`. The UI's absence of a normal Complete button was the only prior barrier.

## Root cause

`completeWorkTask(...)` intentionally sends request kind `COMPLETE` to `setWorkTaskProgress(...)` for non-Pack Consignment work. C3A excluded `COMPLETE` from its final-unit guard to preserve deterministic completion. The generic completion branch then called sequence-based `unlockNextTask(...)` without proving that Mark had an authoritative next stage or that the immediate downstream task matched it.

## Route snapshot semantics and old fixture finding

`actualStages` is treated as the selected evolving route, not as a list of merely decorative labels. For current Mark:

- `PICK, MARK` has no preselected next stage and retains two unresolved choices: Assembly and Pack;
- `PICK, MARK, ASSEMBLE` preselects Assembly;
- `PICK, MARK, PACK` preselects Pack.

The old C3A `single` fixture used `PICK, MARK, ASSEMBLE` but created only Mark followed by Pack. It therefore claimed Assembly was selected while its immediate task plan skipped Assembly. That fixture was invalid evidence for deterministic Pack completion.

The corrected model now contains:

```text
Mark      sequence 2 READY
Assembly  sequence 3 LOCKED
Pack      sequence 4 LOCKED
actualStages = PICK, MARK, ASSEMBLE
```

Generic deterministic completion makes Assembly `READY` and leaves Pack `LOCKED`. A separate valid deterministic-Pack fixture uses `PICK, MARK, PACK` with Pack as the immediate locked downstream task.

## Shared forward-stage truth

Pure stage eligibility moved to the neutral server-compatible module:

`src/lib/workflow/route-stage-eligibility.ts`

It provides both selectable forward stages and the first preselected, uncompleted stage after the current stage. It validates stage arrays and contains no React, UI, database, or policy code.

`WorkTaskCardView` and `task-store` now consume this same helper. `work-route-presentation.ts` re-exports the existing `selectableForwardStages(...)` API so prior consumers and tests remain compatible. No route option changed and no visual markup changed.

## Server-authoritative guard

For generic Mark `COMPLETE`, `task-store` now requires an authoritative deterministic next stage:

1. A canonical snapshot at current Mark uses the next stage already selected in `actualStages`.
2. A canonical untouched legacy Pick snapshot may use its fixed recommended task plan.
3. A legacy task without a snapshot may use a supported saved `processRoute` task plan.
4. A malformed, contradictory, or unresolved snapshot rejects rather than guessing.
5. The immediate task must be exactly `sequenceNumber + 1`, match the expected stage, and be `LOCKED`.
6. The unlock must affect exactly one task or the transaction rolls back.

Worker-safe errors are:

```text
Choose where Mark work goes next before completing marking.
Mark route does not match the next task. Refresh before completing marking.
```

The guard executes after authorization, assignment validation, and successful replay lookup, but before any new mutation.

## Mutation results

The expanded disposable-SQLite regression proves:

- multi-choice `completeWorkTask` rejects without changing Mark, assignment, Pack, Assembly, route decisions, routed audits, completion logs, or projection state;
- multi-choice exact-full `SET_PROGRESS` remains rejected and non-mutating;
- multi-choice exact-full `INCREMENT` remains rejected and non-mutating;
- routed completion to Pack succeeds, makes Pack `READY`, creates no Assembly, and writes one route decision plus one `WORK_STAGE_COMPLETED_AND_ROUTED` audit;
- routed completion to Assembly succeeds, makes Assembly `READY`, keeps Pack `LOCKED`, and writes one route decision plus one routed audit;
- partial Set and Increment remain `IN_PROGRESS` and do not unlock downstream work;
- preselected Assembly generic completion makes Assembly `READY` and leaves Pack `LOCKED`;
- valid deterministic Pack generic completion makes Pack `READY`;
- snapshot-selected Assembly with immediate Pack rejects and skips nothing;
- deterministic Pack replay returns `idempotent: true`, writes one completion log, and mutates once;
- stale quantity and stale routed version reject;
- assignment, selected-account, view-only, and missing-Mark-permission protections remain authoritative;
- OWNER compatibility remains unchanged;
- the Pick final-unit guard remains effective;
- the Pack authoritative boundary remains effective.

Generic deterministic completion does not create a new route decision or routed-stage audit because the next stage was already authoritative. Unresolved choices must use `completeStageAndChooseNext(...)`, which preserves those records.

## Changed files

| File | Purpose |
|---|---|
| `src/lib/workflow/task-store.ts` | Server-authoritative deterministic Mark completion proof and exact downstream unlock assertion. |
| `src/lib/workflow/route-stage-eligibility.ts` | New neutral pure shared forward-stage helper. |
| `src/lib/workflow/work-route-presentation.ts` | Re-exports the moved compatibility API. |
| `app/work/WorkTaskCardView.tsx` | Tiny import/call adjustment to consume the shared neutral truth; no visual change. |
| `tests/phase-7-4c3a-mark-progress-safety.test.ts` | Crafted Complete regression and corrected deterministic/mismatch coverage. |
| `tests/phase-7-4c2-pick-experience.test.tsx` | Updates the intentional task-store hash pin; Pick mutation assertions are unchanged. |
| `scripts/staging/seed.ts` | Corrects synthetic preselected-Assembly task-plan truth. |
| `scripts/qa/phase-7-4c3a-browser.mjs` | Uses the corrected C3A synthetic fixtures. |
| `package.json` | Removes the duplicate key and adds the C3A.1 test command. |

No dependency was added.

## Protected hash audit

All non-authorized protected workflow files retained their exact C3A SHA-256 values:

| File | Pre and post SHA-256 |
|---|---|
| `route-decision-policy.ts` | `7e80762e3062d66b8c30491cf3decef6f3325009e946a66f94299df271a3b53e` |
| `route-selection.ts` | `d7f465a9cfe7b92254ea2d6479eb238dfca25f3eff729a2ed6fc0ca3c517402f` |
| `grouped-transition.ts` | `5a52d4798bed591c1f6f8af9c6c6646e65ad6596595a5b7f9c797ffee4f2517c` |
| `grouped-progress.ts` | `98592bc58d9e2ce8deff9417e4917415ad0ddf82d679d7b620fd0a2903890266` |
| `stage-transition.ts` | `c357bfa890b8ef6549525463fe4ec98a5637c813047c5914959dfe2d20d574af` |
| `order-pack-scope.ts` | `65e30f0f66dd536f16b92bed8b0979f9b13da4609a9ab45df7541b1d564ad6f3` |
| `order-problems.ts` | `d2f6c7f2fb570883c93b7733832a3fc5e088654cd9b91cee00e67715b4533314` |

Authorized `task-store.ts` changed from `4b2585611526ff1a680b86c7a8c5c23c8845f861b239f4d5552f9325d8d7dfe8` to `f5f6018e48e9398797ca058b6ec634e12904b512f46ac96a37d06bab1e52dd3a`.

## Validation

All required gates passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; 152 existing warnings under `.agents/skills/impeccable`
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run phase7.4c2:test`
- `npm.cmd run phase7.4c3a:test`
- `npm.cmd run phase7.4c3a1:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run grouped-details:test`
- `git diff --check`

No historical atlas or PostgreSQL migration was run.

## Exact runtime and focused browser smoke

- Runtime commit: `6a6df8e8b013cd4d7c18fd4284adf7c1cd669a44`
- BUILD_ID: `BmaMX_iryy1Dbjr46zNec`
- Route count: `123`
- Build database: `SYNTHETIC_ONLY`
- Browser: installed Google Chrome
- Staging identity: `PRIVATE_SYNTHETIC_STAGING`
- Browser records: `4`
- Browser failures: `0`

At both `390x844` and `1440x900`:

- the genuine multi-choice card retained `Marking Completed`;
- Process Flow opened with Pack and Assembly choices;
- focus entered the dialog and returned to the trigger;
- Partial Quantity bounds were `min=1`, `max=5` for required quantity `6`, excluding the final unit;
- the genuine preselected-Assembly card retained its enabled normal `Complete remaining 6` action and no route-choice trigger;
- document width equaled viewport width;
- undersized enabled controls: `0`;
- console errors: `0`;
- page errors: `0`;
- request failures: `0`;
- HTTP responses at 400 or above: `0`.

## Final protected state

- Prisma schema/migrations: unchanged
- PostgreSQL: not accessed or migrated
- `mobile-app`: unchanged
- real data: untouched
- UI visuals: unchanged
- C3 UI: not resumed
- staging: stopped
- port 3188: closed
- runtime dependencies added: none
- PR: not opened
- merge/deploy: not performed
- push scope: only `phase-7.4c3a1-mark-complete-path-safety`
- final branch HEAD: the documentation commit containing this report; exact SHA is recorded in the push handoff because a commit cannot contain its own hash

