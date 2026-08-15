# Phase 7.4C3 Mark Progress Bypass Blocker Report

## Result

`PHASE_7_4C3_BLOCKED_MARK_PROGRESS_BYPASS`

Phase 7.4C3 UI implementation did not begin. The mandatory backend-bypass gate reproduced a correctness defect that can silently complete individual Consignment Mark work without the required Process Flow decision.

## Boundary

- Required starting branch: `phase-7.4c2-professional-pick-experience`
- Verified starting HEAD: `a5a6ad9315e3d00924a83bf1eff7153e388cea07`
- Verified remote HEAD: `a5a6ad9315e3d00924a83bf1eff7153e388cea07`
- C2 browser-tested runtime: `065b9519e3a1aa74b7d9c064dfdc3d09a7eb12e6`
- C2 BUILD_ID: `1EGWkxn4chvBfr-67uYA-`
- C3 evidence branch: `phase-7.4c3-professional-mark-experience`
- Starting worktree: clean
- Starting staging state: stopped
- Starting port 3188 state: closed

## Reproduction

Executable evidence:

`tests/phase-7-4c3-mark-progress-bypass.repro.test.ts`

Command:

```powershell
npx.cmd tsx tests/phase-7-4c3-mark-progress-bypass.repro.test.ts
```

Result:

```text
REPRODUCED: generic exact-full Mark progress bypasses the required Process Flow decision.
```

The test uses a disposable SQLite database created from the repository migrations. It does not access staging or real data.

## Exact case

The synthetic Consignment Mark task has:

- current stage `MARK`;
- required quantity `6` and completed quantity `0`;
- selected stages `PICK`, `MARK`;
- completed stage `PICK`;
- saved route `PICK_MARK_PACK`;
- a locked Pack task at the next sequence;
- a genuine UI-compatible forward choice of `ASSEMBLE` or `PACK` from `selectableForwardStages(...)`.

A crafted generic progress request calls `setWorkTaskProgress(...)` with:

```text
requestKind = SET_PROGRESS
targetQuantity = requiredQuantity = 6
```

Observed authoritative result:

- Mark becomes `COMPLETED` at quantity `6`;
- the existing Pack task becomes `READY` through sequence-based `unlockNextTask(...)`;
- no Assembly task is created;
- no `WorkRouteDecision` is recorded;
- no `WORK_STAGE_COMPLETED_AND_ROUTED` audit record is recorded;
- the only completion receipt is a generic `TASK_COMPLETED` / `SET_PROGRESS` work-action log.

## Why this is a blocker

The approved C1A.1 Mark interaction requires the worker to explicitly select and submit a valid next stage when more than one destination is available. The generic progress path currently guards exact-full Pick submissions, but not exact-full Mark submissions. It therefore bypasses the Mark decision, route-policy evidence, and routed-stage audit semantics while changing downstream work availability.

This is not a presentation-only issue and cannot be safely repaired inside C3 without changing a protected workflow service. The C3 brief explicitly requires stopping rather than modifying that service silently.

## Protected boundary

No changes were made to:

- `src/lib/workflow/route-decision-policy.ts`
- `src/lib/workflow/route-selection.ts`
- `src/lib/workflow/grouped-transition.ts`
- `src/lib/workflow/grouped-progress.ts`
- `src/lib/workflow/stage-transition.ts`
- `src/lib/workflow/order-pack-scope.ts`
- `src/lib/workflow/order-problems.ts`
- `src/lib/workflow/task-store.ts`
- Prisma schemas or migrations
- `mobile-app`
- marketplace runtime UI files

No dependency was added. No staging, browser, build, or design-polish work was performed after the stop gate because C3 implementation is blocked before those activities are valid.

## Required next authorization

Authorize a separate, narrowly scoped correctness repair that prevents non-`COMPLETE` exact-full Mark progress from bypassing an explicit Process Flow decision, while preserving:

- valid bounded partial Mark progress;
- idempotent replay;
- single-destination compatible Mark completion;
- existing Pick, Assembly, and Pack behavior;
- assignment and selected-account protection;
- route-reason and missing-instruction policy.

After that repair is independently tested and approved, restart C3 from the repaired required HEAD and rerun the full C3 implementation brief.
