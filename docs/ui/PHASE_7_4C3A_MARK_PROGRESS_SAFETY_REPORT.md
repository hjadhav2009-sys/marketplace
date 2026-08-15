# Phase 7.4C3A Mark Progress Safety Report

## Result

`PHASE_7_4C3A_MARK_PROGRESS_BYPASS_CLOSED`

This checkpoint closes only the generic-progress Mark final-unit bypass. Phase C3 UI work did not resume.

## Boundary and identity

- Evidence branch: `phase-7.4c3-professional-mark-experience`
- Verified evidence HEAD: `63c88acdcd21b726bf8ce1f677fb4e8d20a7dd06`
- Evidence remote HEAD: `63c88acdcd21b726bf8ce1f677fb4e8d20a7dd06`
- Approved C2 final HEAD: `a5a6ad9315e3d00924a83bf1eff7153e388cea07`
- Approved C2 runtime: `065b9519e3a1aa74b7d9c064dfdc3d09a7eb12e6`
- Approved C2 BUILD_ID: `1EGWkxn4chvBfr-67uYA-`
- Repair branch: `phase-7.4c3a-mark-progress-safety`
- Repaired runtime commit: `9e58ea05f4bc228ef79a73dc18d73d01a68f5f45`
- Repaired BUILD_ID: `n-ucY6dLOJm6_SEXvXk1C`
- Build database identity: `SYNTHETIC_ONLY`
- Build route count: `123`
- Final branch HEAD: the documentation commit containing this report; its exact SHA is recorded in the push handoff because a commit cannot contain its own hash.

The starting worktree was clean. Staging was stopped and port 3188 was closed. The diff from approved C2 to the evidence HEAD contained only the blocker report and executable reproduction.

## Historical reproduction

Before the repair, the preserved disposable-SQLite reproduction printed:

```text
REPRODUCED: generic exact-full Mark progress bypasses the required Process Flow decision.
```

Observed state:

| Evidence | Before | Crafted generic full SET_PROGRESS | After |
|---|---:|---:|---:|
| Mark status | `READY` | completed | `COMPLETED` |
| Mark quantity | `0/6` | target `6` | `6/6` |
| Pack status | `LOCKED` | sequence unlock | `READY` |
| Assembly tasks | `0` | none created | `0` |
| route decisions | `0` | none written | `0` |
| routed-stage audits | `0` | none written | `0` |

The generic path wrote one `TASK_COMPLETED` action with request kind `SET_PROGRESS`. The historical assertions remain unchanged and are now clearly annotated as pre-fix evidence; the passing C3A regression is the post-fix proof.

## Caller inventory

| Entry point | Classification | Result |
|---|---|---|
| `setTaskProgressAction` -> `setWorkTaskProgress` | `PARTIAL_PROGRESS` | Used by individual `Partial Quantity`; the UI caps the value at `required - 1`, and the server now rejects a crafted exact-full Mark value. |
| `incrementTaskAction` -> `incrementWorkTaskProgress` | `PARTIAL_PROGRESS` / legacy export | No active rendered caller was found; the authoritative guard still covers direct/crafted calls. |
| `completeTaskAction` -> `completeWorkTask` | `FINAL_STAGE_COMPLETION` | Sends request kind `COMPLETE`; preserved for a Mark task with one compatible downstream destination. |
| `WorkRouteActionButton` -> `completeStageAndChooseNext` | `FINAL_STAGE_COMPLETION` | Remains the multi-destination Mark route-decision path. |
| universal action `TASK_INCREMENT` | `PARTIAL_PROGRESS` / API compatibility | The current scanner UI does not emit it, but a crafted action is covered by the server guard. |
| universal complete action | `FINAL_STAGE_COMPLETION` | Continues through `completeWorkTask` and request kind `COMPLETE`. |
| import, production-flow, workflow, concurrency, and direct-stage tests | `LEGACY_COMPATIBILITY` / regression | Legitimate final Mark callers use `COMPLETE`; no supported exact-full generic Mark dependency was found. |

No compatibility blocker was found.

## Root cause and repair

`setWorkTaskProgress(...)` already rejected generic exact-full Pick progress and routed Pack to its authoritative service. Mark lacked the corresponding final-unit invariant, so its generic completion branch called `unlockNextTask(...)` and silently made the next sequence ready.

The only runtime application change is this line in `src/lib/workflow/task-store.ts`, after authorization, target resolution, assignment validation, and duplicate replay:

```diff
 if (task.stage === "PICK" && requestKind !== "COMPLETE" && targetQuantity === task.requiredQuantity) throw new Error("Use Complete Pick and choose a processing flow to finish picking.");
+if (task.stage === "MARK" && requestKind !== "COMPLETE" && targetQuantity === task.requiredQuantity) throw new Error("Use the Mark completion action to finish marking.");
```

The invariant is intentionally presentation-independent: generic/partial progress cannot finish Mark, while `COMPLETE` and the existing routed completion service retain their established responsibilities. No route model, policy, transition, UI, or database schema was changed.

## Mutation regression results

`tests/phase-7-4c3a-mark-progress-safety.test.ts` builds a disposable SQLite database from repository migrations and proves:

- exact-full Mark `SET_PROGRESS` is rejected with Mark, assignment, Pack, Assembly, route decisions, audits, action logs, and projection state unchanged;
- exact-full Mark `INCREMENT` is rejected with the same non-mutation guarantees;
- `SET_PROGRESS` from `0` to `3` of `6` succeeds as `IN_PROGRESS`, with Pack locked and no route decision/audit;
- `INCREMENT` from `0` by `2` succeeds as `IN_PROGRESS`, with Pack locked;
- single-destination request kind `COMPLETE` completes Mark at `6/6` and makes its fixed Pack task `READY`;
- routed completion to Pack completes Mark, makes Pack `READY`, creates no Assembly task, and writes one route decision plus one `WORK_STAGE_COMPLETED_AND_ROUTED` audit;
- routed completion to Assembly completes Mark, creates/reuses Assembly as `READY`, leaves Pack `LOCKED`, and writes one route decision plus one routed-stage audit;
- replay of the Pack routing request is idempotent and leaves exactly one route decision, one routed audit, and one Pack task;
- stale quantity and stale routed-version requests are rejected;
- another worker's assignment, another account, view-only access, and missing Mark permission remain rejected;
- OWNER partial progress remains compatible;
- the existing non-`COMPLETE` exact-full Pick guard remains effective;
- generic Pack progress remains rejected by the authoritative Pack boundary.

No successful action receipt/log is created for either rejected generic full-progress request.

## Protected hash audit

All non-authorized workflow files have identical pre/post SHA-256 values:

| File | Pre and post SHA-256 |
|---|---|
| `route-decision-policy.ts` | `7e80762e3062d66b8c30491cf3decef6f3325009e946a66f94299df271a3b53e` |
| `route-selection.ts` | `d7f465a9cfe7b92254ea2d6479eb238dfca25f3eff729a2ed6fc0ca3c517402f` |
| `grouped-transition.ts` | `5a52d4798bed591c1f6f8af9c6c6646e65ad6596595a5b7f9c797ffee4f2517c` |
| `grouped-progress.ts` | `98592bc58d9e2ce8deff9417e4917415ad0ddf82d679d7b620fd0a2903890266` |
| `stage-transition.ts` | `c357bfa890b8ef6549525463fe4ec98a5637c813047c5914959dfe2d20d574af` |
| `order-pack-scope.ts` | `65e30f0f66dd536f16b92bed8b0979f9b13da4609a9ab45df7541b1d564ad6f3` |
| `order-problems.ts` | `d2f6c7f2fb570883c93b7733832a3fc5e088654cd9b91cee00e67715b4533314` |

Authorized `task-store.ts` changed from `37e2b0f9...d071` to `4b2585611526ff1a680b86c7a8c5c23c8845f861b239f4d5552f9325d8d7dfe8` only through the one-line guard above.

## Changed-file classification

| File | Classification |
|---|---|
| `src/lib/workflow/task-store.ts` | Authorized one-line runtime safety repair. |
| `tests/phase-7-4c3a-mark-progress-safety.test.ts` | Disposable-SQLite mutation regression. |
| `tests/phase-7-4c3-mark-progress-bypass.repro.test.ts` | Historical-evidence annotation only; vulnerable assertions preserved. |
| `tests/phase-7-4c2-pick-experience.test.tsx` | Updates the intentional `task-store.ts` hash pin; the C2 mutation assertions are unchanged. |
| `scripts/staging/seed.ts` | Synthetic-only C3A Mark fixtures. |
| `scripts/qa/phase-7-4c3a-browser.mjs` | Focused Chrome smoke at the two authorized widths. |
| `package.json` | Adds `phase7.4c3a:test` and `phase7.4c3a:browser` commands. |
| this report | Documentation. |

No runtime dependency was added.

## Validation

All required commands passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; 152 existing warnings under `.agents/skills/impeccable`
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run phase7.4c2:test`
- `npm.cmd run phase7.4c3a:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run grouped-details:test`
- `git diff --check`

The C3A regression was rerun after adding the explicit stale-version assertion and passed. No historical atlas, PostgreSQL migration, or unrelated heavy suite was run.

## Exact build and focused browser smoke

One production staging build was created from runtime commit `9e58ea05f4bc228ef79a73dc18d73d01a68f5f45`:

- BUILD_ID: `n-ucY6dLOJm6_SEXvXk1C`
- browser: installed Google Chrome
- staging identity: `PRIVATE_SYNTHETIC_STAGING`
- database: synthetic only
- browser records: `4`
- failures: `0`

At both `390x844` and `1440x900`:

- the multi-destination Mark card retained `Marking Completed`;
- Process Flow opened with Pack and Assembly choices;
- focus entered the dialog and returned to its trigger on Escape;
- Partial Quantity had bounds `min=1`, `max=1` for a required quantity of `2`, so it could not offer the final unit;
- the single-destination Mark card retained its enabled normal `Complete remaining 3` action and did not show the route chooser;
- document width equaled viewport width;
- undersized enabled controls: `0`;
- console errors: `0`;
- page errors: `0`;
- unexpected request failures: `0`;
- HTTP responses at 400 or above: `0`.

The browser harness used equivalent pre-existing synthetic fixtures because the retained staging database was created before the newly added fixture names. This did not modify runtime code or real data, and the server was started from the exact built runtime commit.

## Protected systems and final state

- Prisma schema and migrations: unchanged
- PostgreSQL: not accessed or migrated
- `mobile-app`: unchanged
- real data: untouched
- application UI: unchanged
- C3 UI: not started
- dependencies: none added
- staging: stopped
- port 3188: closed
- push scope: only `phase-7.4c3a-mark-progress-safety`
- PR: not opened
- merge/deploy: not performed

